from __future__ import annotations

import logging

from pydantic import Field
from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.agents.math_presentation import MathIntentClassifier, extract_math_verdict
from stirling.agents.shared import ChunkedReasoner
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
from stirling.models import ApiModel
from stirling.models.agent_tool_models import AgentToolId, MathAuditorAgentParams
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)


PDF_QUESTION_SYSTEM_PROMPT = (
    "You answer questions about PDF documents by retrieving relevant content with the "
    "search_knowledge tool. Use it before answering. Do not guess or use outside knowledge.\n"
    "\n"
    "The search_knowledge tool has a finite call budget per run. When it is no longer "
    "available, answer from what you have already retrieved.\n"
    "\n"
    "Guidelines:\n"
    "- Make targeted search_knowledge calls. Typically one or two is enough.\n"
    "- Answer from the retrieved text. If the retrieved content doesn't support a confident "
    "answer, return not_found.\n"
    "- Include a short list of evidence snippets (with page numbers where available) drawn "
    "from what search_knowledge returned.\n"
    "\n"
    "Writing the not_found reason:\n"
    "- The reason is shown directly to the end user, so write it in plain, friendly "
    "language. One or two short sentences.\n"
    "- NEVER mention 'RAG', 'retrieval', 'chunks', 'search results', 'targeted search', "
    "'search_knowledge', or other implementation details.\n"
    "- For questions where the answer just isn't in the document, say so directly: "
    "'I couldn't find that information in the document.'\n"
    "- Do not make it sound like you're choosing not to answer. Be clear that it's "
    "a genuine constraint."
)


_WHOLE_DOC_INTENT_SYSTEM_PROMPT = (
    "Decide whether answering the user's question requires reading the document "
    "end-to-end rather than looking up specific passages. Set is_whole_doc=true when "
    "the answer depends on aggregating, comparing or summarising content across the "
    "whole document. Examples: 'summarise this PDF', 'what's the shortest chapter', "
    "'how many tables are there', 'what's the largest number used', 'list every "
    "person mentioned'. Set it false when the answer is a specific fact or passage "
    "that targeted retrieval can find. Examples: 'what is the invoice total', 'who "
    "signed the contract', 'what does section 4 say'. Decide from meaning, not "
    "specific keywords; the prompt may be in any language."
)


_WHOLE_DOC_ANSWER_PROMPT = (
    "You are answering the user's question using notes that were extracted from "
    "every part of the document by parallel readers. Each note carries the page "
    "numbers it covers, a short summary, relevant excerpts, and extracted facts.\n"
    "\n"
    "Answer ONLY from the notes. Do not invent information. If the notes do not "
    "support a confident answer, write a brief plain-language explanation in the "
    "answer field rather than guessing.\n"
    "\n"
    "Reply in the SAME LANGUAGE as the user's question. Keep the answer focused "
    "and concise. Populate the evidence field with up to a handful of supporting "
    "excerpts pulled from the notes' relevant_excerpts, each tagged with its "
    "page number where the notes provide one."
)


class _WholeDocIntentDecision(ApiModel):
    is_whole_doc: bool = Field(
        description=(
            "True if answering the question requires reading the document "
            "end-to-end rather than looking up a specific passage."
        ),
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
        self._whole_doc_intent_agent: Agent[None, _WholeDocIntentDecision] = Agent(
            model=runtime.fast_model,
            output_type=_WholeDocIntentDecision,
            system_prompt=_WHOLE_DOC_INTENT_SYSTEM_PROMPT,
            model_settings=runtime.fast_model_settings,
        )
        self._chunked_reasoner = ChunkedReasoner(runtime)

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
        if len(request.files) == 1 and await self._needs_whole_doc(request.question):
            return await self._run_whole_doc_answer(request)
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
        missing: list[AiFile] = []
        for file in files:
            if not await self.runtime.documents.has_collection(file.id):
                missing.append(file)
        return missing

    async def _needs_whole_doc(self, question: str) -> bool:
        """Decide via a small classifier LLM whether the question needs full-doc reasoning.

        Multi-file requests skip this check in :meth:`handle` for now and fall
        through to the RAG-search path; the chunked reasoner is single-document
        in v1.
        """
        if not question:
            return False
        result = await self._whole_doc_intent_agent.run(question)
        return result.output.is_whole_doc

    async def _run_whole_doc_answer(self, request: PdfQuestionRequest) -> PdfQuestionTerminalResponse:
        """Answer a whole-document question by chunked map-then-synthesise.

        Reads the file's stored pages, fans them out into worker LLM calls that
        extract question-relevant notes, then synthesises a single answer. Used
        for aggregations, comparisons and summaries that targeted RAG retrieval
        cannot answer well.
        """
        file = request.files[0]
        pages = await self.runtime.documents.read_pages(file.id)
        if not pages:
            logger.info(
                "[pdf-question] whole-doc requested but no pages stored for %s; falling back to RAG-search path",
                file.name,
            )
            return await self._run_answer_agent(request)

        logger.info(
            "[pdf-question] whole-doc path: file=%s pages=%d question=%r",
            file.name,
            len(pages),
            request.question,
        )
        return await self._chunked_reasoner.reason(
            pages=pages,
            question=request.question,
            answer_prompt=_WHOLE_DOC_ANSWER_PROMPT,
            answer_type=PdfQuestionAnswerResponse,
        )

    async def _run_answer_agent(self, request: PdfQuestionRequest) -> PdfQuestionTerminalResponse:
        rag = RagCapability(
            documents=self.runtime.documents,
            collections=[file.id for file in request.files],
            top_k=self.runtime.settings.rag_default_top_k,
            max_searches=self.runtime.settings.rag_max_searches,
        )
        agent = Agent(
            model=self.runtime.smart_model,
            output_type=NativeOutput([PdfQuestionAnswerResponse, PdfQuestionNotFoundResponse]),
            system_prompt=PDF_QUESTION_SYSTEM_PROMPT,
            instructions=rag.instructions,
            toolsets=[rag.toolset],
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
            "Use search_knowledge to retrieve the relevant content, then answer."
        )
