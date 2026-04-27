from __future__ import annotations

from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.agents._page_text import (
    format_page_text,
    get_extracted_text_artifact,
    has_page_text,
)
from stirling.agents.math_presentation import MathIntentClassifier, extract_math_verdict
from stirling.contracts import (
    EditPlanResponse,
    NeedContentFileRequest,
    NeedContentResponse,
    OrchestratorRequest,
    PdfContentType,
    PdfQuestionAnswerResponse,
    PdfQuestionNotFoundResponse,
    PdfQuestionRequest,
    PdfQuestionResponse,
    SupportedCapability,
    ToolOperationStep,
    Verdict,
    format_conversation_history,
)
from stirling.models.agent_tool_models import AgentToolId, MathAuditorAgentParams
from stirling.services import AppRuntime

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
        rag = runtime.rag_capability
        self.agent = Agent(
            model=runtime.smart_model,
            output_type=NativeOutput(
                [
                    PdfQuestionAnswerResponse,
                    PdfQuestionNotFoundResponse,
                ]
            ),
            system_prompt=(
                "Answer questions about PDFs using only the extracted page text provided in the prompt. "
                "Do not guess or use outside knowledge. "
                "If the answer is not supported by the provided text, return not_found. "
                "When answering, include a short list of evidence snippets with their page numbers. "
                "Reply in the SAME LANGUAGE as the question."
            ),
            instructions=rag.instructions,
            toolsets=[rag.toolset],
            model_settings=runtime.smart_model_settings,
        )
        self._math_synth_agent: Agent[None, str] = Agent(
            model=runtime.fast_model,
            output_type=str,
            system_prompt=_MATH_SYNTH_SYSTEM_PROMPT,
            model_settings=runtime.fast_model_settings,
        )
        self._math_intent_classifier = MathIntentClassifier(runtime)

    async def handle(self, request: PdfQuestionRequest) -> PdfQuestionResponse:
        if not has_page_text(request.page_text):
            return NeedContentResponse(
                resume_with=SupportedCapability.PDF_QUESTION,
                reason="No extracted PDF page text was provided, so the question cannot be answered yet.",
                files=[
                    NeedContentFileRequest(
                        file_name=file_name,
                        content_types=[PdfContentType.PAGE_TEXT],
                    )
                    for file_name in request.file_names
                ],
                max_pages=self.runtime.settings.max_pages,
                max_characters=self.runtime.settings.max_characters,
            )
        return await self._run_answer_agent(request)

    async def orchestrate(self, request: OrchestratorRequest) -> PdfQuestionResponse:
        """Entry point for the orchestrator delegate.

        Decides math intent locally via a small classifier LLM (language-agnostic).
        On a math first turn, embeds an :class:`EditPlanResponse` in the answer
        response; on the resume turn, digests the captured :class:`Verdict` into
        a localised prose answer. Non-math first turns fall through to the
        text-grounded :meth:`handle` pipeline.
        """
        verdict = extract_math_verdict(request)
        if verdict is not None:
            # Resume turn — Verdict in hand. Synthesise a localised answer from
            # the structured verdict via a small LLM that mirrors the user's
            # language; no English glue in the response.
            answer = await self._synthesise_math_answer(request.user_message, verdict)
            return PdfQuestionAnswerResponse(answer=answer, evidence=[])

        if await self._math_intent_classifier.classify(request.user_message):
            # First turn — ask the caller to run the math specialist and come back.
            # The plan rides on the answer response as a nullable member; ``answer``
            # is empty on this turn and the caller resumes once the plan is run.
            return PdfQuestionAnswerResponse(
                answer="",
                evidence=[],
                edit_plan=EditPlanResponse(
                    summary="",
                    steps=[
                        ToolOperationStep(
                            tool=AgentToolId.MATH_AUDITOR_AGENT,
                            parameters=MathAuditorAgentParams(),
                        )
                    ],
                    resume_with=SupportedCapability.PDF_QUESTION,
                ),
            )

        extracted_text = get_extracted_text_artifact(request)
        return await self.handle(
            PdfQuestionRequest(
                question=request.user_message,
                file_names=request.file_names,
                page_text=extracted_text.files if extracted_text is not None else [],
                conversation_history=request.conversation_history,
            )
        )

    async def _run_answer_agent(self, request: PdfQuestionRequest) -> PdfQuestionResponse:
        result = await self.agent.run(self._build_prompt(request))
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
        file_names = ", ".join(request.file_names) if request.file_names else "Unknown files"
        pages = format_page_text(request.page_text, empty="")
        history = format_conversation_history(request.conversation_history)
        return (
            f"Conversation history:\n{history}\n"
            f"Files: {file_names}\n"
            f"Question: {request.question}\n"
            f"Extracted page text:\n{pages}"
        )
