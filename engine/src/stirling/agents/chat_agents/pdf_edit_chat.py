"""Chat agent that wraps the existing PdfEditAgent for streaming tool-call planning."""

from __future__ import annotations

import re

from stirling.agents.pdf_edit import PdfEditAgent
from stirling.contracts import (
    EditCannotDoResponse,
    EditClarificationRequest,
    EditPlanResponse,
    PdfEditRequest,
)
from stirling.contracts.pdf_edit import SuggestionOption
from stirling.contracts.chat import ChatRequest
from stirling.services import AppRuntime
from stirling.streaming import EventEmitter


class PdfEditChatAgent:
    """Streaming wrapper around PdfEditAgent.

    Translates a chat request into a PdfEditRequest, runs the planner,
    and emits the resulting tool-operation steps as an ``action_required``
    event so the frontend can execute them via its existing tool pipeline.
    """

    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self.edit_agent = PdfEditAgent(runtime)

    async def handle(
        self,
        request: ChatRequest,
        emitter: EventEmitter,
        parent_agent_id: str | None = None,
    ) -> None:
        agent_id = emitter.agent_start("PDF Editor", parent_agent_id)

        if not request.file_names:
            emitter.token(
                agent_id,
                "No documents are loaded. Please upload a PDF first so I can edit it.",
            )
            emitter.agent_complete(agent_id, status="error", result_summary="No files")
            return

        # Build PdfEditRequest from the chat context
        edit_request = PdfEditRequest(
            user_message=request.message,
            file_names=request.file_names,
        )

        # Run the planner
        plan_id = emitter.agent_start("Operation Planner", agent_id)
        try:
            result = await self.edit_agent.handle(edit_request)
        except Exception as exc:
            emitter.error(plan_id, str(exc))
            emitter.agent_complete(plan_id, status="error", result_summary="Planning failed")
            emitter.agent_complete(agent_id, status="error", result_summary="Planning failed")
            return

        if isinstance(result, EditCannotDoResponse):
            emitter.token(agent_id, result.message)
            emitter.agent_complete(plan_id, status="success", result_summary="Cannot do")
            emitter.agent_complete(agent_id, status="success", result_summary="Cannot do")
            return

        if isinstance(result, EditClarificationRequest):
            emitter.token(agent_id, result.question)
            suggestions = result.suggestions
            # Fallback: if LLM didn't populate suggestions, try to extract from question text
            if not suggestions:
                suggestions = self._extract_suggestions_from_text(result.question)
            if suggestions:
                emitter.suggestions(
                    agent_id,
                    [s.model_dump(by_alias=True) for s in suggestions],
                )
            emitter.agent_complete(plan_id, status="success", result_summary="Needs clarification")
            emitter.agent_complete(agent_id, status="success", result_summary="Needs clarification")
            return

        assert isinstance(result, EditPlanResponse)

        step_count = len(result.steps)
        emitter.agent_complete(
            plan_id,
            status="success",
            result_summary=f"Planned {step_count} operation(s)",
        )

        # Build a human-readable summary
        lines = [f"**Plan:** {result.summary}\n"]
        for i, step in enumerate(result.steps, 1):
            params_summary = ", ".join(
                f"{k}={v}"
                for k, v in step.parameters.model_dump(exclude_none=True, by_alias=True).items()
                if k != "fileInput"
            )
            lines.append(f"{i}. **{step.tool.value}**{f' ({params_summary})' if params_summary else ''}")
        lines.append("\nApprove to execute these operations on your document(s).")

        emitter.token(agent_id, "\n".join(lines))

        # Emit action_required so the frontend can execute the plan
        emitter.action_required(
            agent_id,
            action_type="edit_plan",
            action_payload={
                "summary": result.summary,
                "steps": [
                    {
                        "tool": step.tool.value,
                        "parameters": step.parameters.model_dump(exclude_none=True, by_alias=True),
                    }
                    for step in result.steps
                ],
                "fileNames": request.file_names,
            },
        )

        emitter.agent_complete(
            agent_id,
            status="success",
            result_summary=f"{step_count} operation(s) planned",
        )

    @staticmethod
    def _extract_suggestions_from_text(text: str) -> list[SuggestionOption]:
        """Fallback: parse parenthesized option lists from clarification text."""
        _OTHER_HINT = re.compile(r"^(a\s+)?custom\b|^other\b|^specify\b", re.IGNORECASE)
        suggestions: list[SuggestionOption] = []
        for m in re.finditer(r"\(([^)]{8,200})\)", text):
            inner = m.group(1)
            if "," not in inner and " or " not in inner:
                continue
            parts = re.split(r",\s*|\s+or\s+", inner)
            parts = [
                re.sub(r"^e\.g\.?\s*", "", p, flags=re.IGNORECASE).strip()
                for p in parts
            ]
            parts = [p for p in parts if 1 < len(p) < 60]
            if len(parts) >= 2:
                suggestions = [
                    SuggestionOption(label=p, is_other=bool(_OTHER_HINT.search(p)))
                    for p in parts
                ]
                break

        # Always ensure there's an "other" option if we have suggestions
        if suggestions and not any(s.is_other for s in suggestions):
            # Derive a contextual label from the question
            other_label = _derive_other_label(text)
            suggestions.append(SuggestionOption(label=other_label, is_other=True))

        return suggestions


def _derive_other_label(question: str) -> str:
    """Generate a context-specific 'other' label from the clarification question."""
    q = question.lower()
    if "angle" in q or "degree" in q or "rotat" in q:
        return "Custom angle"
    if "page" in q:
        return "Specific pages"
    if "size" in q or "dimension" in q or "scale" in q:
        return "Custom size"
    if "format" in q or "type" in q or "convert" in q:
        return "Other format"
    if "color" in q or "colour" in q:
        return "Custom color"
    if "password" in q:
        return "Custom password"
    if "quality" in q or "compress" in q:
        return "Custom quality"
    if "watermark" in q or "text" in q:
        return "Custom text"
    return "Something else"
