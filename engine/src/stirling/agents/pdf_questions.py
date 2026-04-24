from __future__ import annotations

from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.agents._page_text import (
    format_page_text,
    get_extracted_text_artifact,
    has_page_text,
)
from stirling.agents.math_presentation import (
    extract_math_verdict,
    is_math_intent,
    verdict_to_prose,
)
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
    format_conversation_history,
)
from stirling.models.agent_tool_models import AgentToolId, MathAuditorAgentParams
from stirling.services import AppRuntime


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
                "When answering, include a short list of evidence snippets with their page numbers."
            ),
            instructions=rag.instructions,
            toolsets=[rag.toolset],
            model_settings=runtime.smart_model_settings,
        )

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

    async def orchestrate(self, request: OrchestratorRequest) -> PdfQuestionResponse | EditPlanResponse:
        """Entry point for the orchestrator delegate.

        When the prompt smells like math, consults the math-auditor specialist first (via a
        plan step + resume), then digests the :class:`Verdict` into a prose answer. All other
        prompts fall through to the normal :meth:`handle` pipeline.
        """
        if is_math_intent(request.user_message):
            verdict = extract_math_verdict(request)
            if verdict is None:
                # First turn — ask Java to run the math specialist and come back.
                return EditPlanResponse(
                    summary="Consulting the math auditor to answer the question...",
                    steps=[
                        ToolOperationStep(
                            tool=AgentToolId.MATH_AUDITOR_AGENT,
                            parameters=MathAuditorAgentParams(),
                        )
                    ],
                    resume_with=SupportedCapability.PDF_QUESTION,
                )
            # Second turn — Verdict in hand, render as a prose answer.
            return PdfQuestionAnswerResponse(
                answer=verdict_to_prose(verdict),
                evidence=[],
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
