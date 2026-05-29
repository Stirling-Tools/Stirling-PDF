from __future__ import annotations

import logging

from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.agents.contradiction import ContradictionCapability, ContradictionDetector
from stirling.agents.math_presentation import MathIntentClassifier, extract_math_verdict
from stirling.agents.shared import ChunkedReasoner, WholeDocReaderCapability
from stirling.contracts import (
    AiFile,
    EditPlanResponse,
    NeedIngestResponse,
    OrchestratorRequest,
    PdfContentType,
    PdfQuestionAnswerResponse,
    PdfQuestionNotFoundResponse,
    PdfQuestionOrchestrateResponse,
    PdfQuestionRequest,
    PdfQuestionResponse,
    PdfQuestionTerminalResponse,
    SupportedCapability,
    ToolOperationStep,
    Verdict,
    format_conversation_history,
    format_file_names,
)
from stirling.documents import RagCapability
from stirling.models import PrincipalId
from stirling.models.agent_tool_models import AgentToolId, MathAuditorAgentParams
from stirling.services import AppRuntime, require_current_user_id

logger = logging.getLogger(__name__)


PDF_QUESTION_SYSTEM_PROMPT = (
    "You answer questions about PDF documents using three retrieval tools:\n"
    "\n"
    "1. search_knowledge(query) - returns the passages most semantically similar "
    "to the query. Use it for targeted lookups: a specific fact, a named section, "
    "a particular passage. Typically one or two calls is enough.\n"
    "\n"
    "2. read_full_document(query) - reads every page of the attached documents in "
    "parallel and returns notes relevant to the query. Use it when answering "
    "requires seeing the whole document end-to-end: summaries, aggregations "
    "(largest, shortest, count), comparisons across sections. It is more "
    "expensive than search_knowledge, so prefer search_knowledge when one or two "
    "passages would suffice.\n"
    "\n"
    "3. find_contradictions(query) - audits the attached documents for textual "
    "contradictions across pages (opposing claims, conflicting recommendations, "
    "inconsistent deadlines, etc.) and returns a notes-style report. Use it when "
    "the question is about logical or textual consistency of the content (NOT "
    "numerical math). One call audits the entire document set.\n"
    "\n"
    "Pick the right tool, call it, then answer from what you got back. Do not "
    "guess or use outside knowledge.\n"
    "\n"
    "Guidelines:\n"
    "- If the retrieved content does not support a confident answer, return not_found.\n"
    "- Include a short list of evidence snippets (with page numbers where available) "
    "drawn from what the tools returned.\n"
    "\n"
    "Writing the not_found reason:\n"
    "- The reason is shown directly to the end user, so write it in plain, friendly "
    "language. One or two short sentences.\n"
    "- NEVER mention 'RAG', 'retrieval', 'chunks', 'search results', 'targeted search', "
    "'search_knowledge', 'read_full_document', 'find_contradictions', or other "
    "implementation details.\n"
    "- For questions where the answer just isn't in the document, say so directly: "
    "'I couldn't find that information in the document.'\n"
    "- Do not make it sound like you're choosing not to answer."
)


_MATH_SYNTH_SYSTEM_PROMPT = (
    "You are given a math-audit Verdict (structured JSON) and the user's "
    "original question. Answer the question in plain prose using only "
    "facts from the Verdict; do not invent figures or pages. "
    "Reply in the SAME LANGUAGE as the user's question. Keep the answer "
    "concise — a sentence or short paragraph. "
    "Quote any stated/expected numeric values from the Verdict verbatim — "
    "do not paraphrase, abbreviate, or convert units."
)


class PdfQuestionAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self._math_synth_agent: Agent[None, str] = Agent(
            model=runtime.fast_model,
            output_type=str,
            system_prompt=_MATH_SYNTH_SYSTEM_PROMPT,
            model_settings=runtime.fast_model_settings,
        )
        self._math_intent_classifier = MathIntentClassifier(runtime)
        # Shared across whole-doc-reader instances so the worker agent and
        # semaphore are constructed once and reused per request.
        self._chunked_reasoner = ChunkedReasoner(runtime)
        # Per consuming-agent instance (which is per-request in the
        # orchestrator) — reused across the request's capability instances
        # (mirrors the chunked-reasoner pattern).
        self._contradiction_detector = ContradictionDetector(runtime)

    async def handle(self, request: PdfQuestionRequest) -> PdfQuestionResponse:
        logger.info(
            "[pdf-question] handle: files=%s question=%r",
            [file.name for file in request.files],
            request.question,
        )
        missing = await self._find_missing_files(request.files)
        if missing:
            logger.info("[pdf-question] missing ingestions: %s", [file.name for file in missing])
            return NeedIngestResponse(
                resume_with=SupportedCapability.PDF_QUESTION,
                reason="Some files have not been ingested yet.",
                files_to_ingest=missing,
                content_types=[PdfContentType.PAGE_TEXT],
            )
        return await self._run_answer_agent(request)

    async def orchestrate(self, request: OrchestratorRequest) -> PdfQuestionOrchestrateResponse:
        """Entry point for the orchestrator delegate.

        Decides math intent locally via a small classifier LLM (language-agnostic).
        On a math first turn, returns an :class:`EditPlanResponse` (``outcome=PLAN``)
        with ``resume_with=PDF_QUESTION`` so the caller runs the math specialist
        and re-invokes the orchestrator. On the resume turn, the captured
        :class:`Verdict` is digested into a localised prose answer. Non-math
        first turns fall through to the text-grounded :meth:`handle` pipeline.
        """
        verdict = extract_math_verdict(request)
        if verdict is not None:
            # Resume turn — Verdict in hand. Synthesise a localised answer from
            # the structured verdict via a small LLM that mirrors the user's
            # language; no English glue in the response.
            answer = await self._synthesise_math_answer(request.user_message, verdict)
            return PdfQuestionAnswerResponse(answer=answer, evidence=[])

        if await self._math_intent_classifier.classify(request.user_message):
            # First turn — emit a one-step plan calling the math specialist,
            # with resume_with set so the caller comes back with the verdict
            # in artifacts (handled by the resume branch above).
            return EditPlanResponse(
                summary="",
                steps=[
                    ToolOperationStep(
                        tool=AgentToolId.MATH_AUDITOR_AGENT,
                        parameters=MathAuditorAgentParams(),
                    )
                ],
                resume_with=SupportedCapability.PDF_QUESTION,
            )

        return await self.handle(
            PdfQuestionRequest(
                question=request.user_message,
                files=request.files,
                conversation_history=request.conversation_history,
            )
        )

    async def _find_missing_files(self, files: list[AiFile]) -> list[AiFile]:
        principals = [PrincipalId(require_current_user_id())]
        missing: list[AiFile] = []
        for file in files:
            if not await self.runtime.documents.has_collection(file.id, principals=principals):
                missing.append(file)
        return missing

    async def _run_answer_agent(self, request: PdfQuestionRequest) -> PdfQuestionTerminalResponse:
        """Drive a single smart-model agent with both retrieval tools.

        The agent picks ``search_knowledge`` for targeted lookups and
        ``read_full_document`` for whole-document questions. Removing the
        upstream classifier keeps that judgement in the same call that writes
        the answer, and lets the agent mix tools when the question warrants it.
        """
        principals = [PrincipalId(require_current_user_id())]
        rag = RagCapability(
            documents=self.runtime.documents,
            principals=principals,
            collections=[file.id for file in request.files],
            top_k=self.runtime.settings.rag_default_top_k,
            max_searches=self.runtime.settings.rag_max_searches,
        )
        whole_doc = WholeDocReaderCapability(
            runtime=self.runtime,
            files=request.files,
            principals=principals,
            reasoner=self._chunked_reasoner,
        )
        contradiction = ContradictionCapability(
            detector=self._contradiction_detector,
            files=request.files,
            principals=principals,
        )
        agent = Agent(
            model=self.runtime.smart_model,
            output_type=NativeOutput([PdfQuestionAnswerResponse, PdfQuestionNotFoundResponse]),
            system_prompt=PDF_QUESTION_SYSTEM_PROMPT,
            # pydantic-ai accepts a list of (string-or-callable) instruction sources;
            # it resolves each at run time and concatenates them for the model.
            instructions=[rag.instructions, whole_doc.instructions, contradiction.instructions],
            toolsets=[rag.toolset, whole_doc.toolset, contradiction.toolset],
            model_settings=self.runtime.smart_model_settings,
        )
        prompt = self._build_prompt(request)
        logger.debug("[pdf-question] prompt:\n%s", prompt)
        result = await agent.run(prompt)
        return result.output

    async def _synthesise_math_answer(self, user_message: str, verdict: Verdict) -> str:
        """Use a small LLM to render the structured Verdict as a natural-language
        answer in the same language as the user's question. The system prompt
        forbids invented figures; the LLM only restates Verdict facts.
        """
        prompt = f"User question:\n{user_message}\n\nMath audit Verdict (JSON):\n{verdict.model_dump_json()}"
        result = await self._math_synth_agent.run(prompt)
        return result.output

    def _build_prompt(self, request: PdfQuestionRequest) -> str:
        history = format_conversation_history(request.conversation_history)
        return (
            f"Conversation history:\n{history}\n"
            f"Files: {format_file_names(request.files)}\n"
            f"Question: {request.question}\n"
            "Pick the right retrieval tool for this question, then answer from what it returns."
        )
