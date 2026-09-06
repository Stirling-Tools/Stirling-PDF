from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Literal, assert_never

from pydantic import ConfigDict, Field
from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput, ToolOutput
from pydantic_ai.settings import ModelSettings
from pydantic_ai.tools import RunContext

from stirling.agents.output_mode import output_retries, uses_tool_output
from stirling.agents.pdf_create import PdfCreateAgent
from stirling.agents.pdf_edit import PdfEditAgent
from stirling.agents.pdf_questions import PdfQuestionAgent
from stirling.agents.pdf_review import PdfReviewAgent
from stirling.agents.surface import allows, capabilities_for, document_work_decline
from stirling.agents.user_spec import UserSpecAgent
from stirling.contracts import (
    AgentDraftWorkflowResponse,
    AssistantSurface,
    ExtractedTextArtifact,
    OrchestratorRequest,
    OrchestratorResponse,
    PdfEditResponse,
    PdfQuestionOrchestrateResponse,
    PdfReviewOrchestrateResponse,
    SupportedCapability,
    UnsupportedCapabilityResponse,
    format_conversation_history,
    format_file_names,
)
from stirling.contracts.pdf_create import PdfCreateOrchestrateResponse
from stirling.models import ApiModel
from stirling.services import AppRuntime, language_directive, set_reply_locale

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class OrchestratorDeps:
    runtime: AppRuntime
    request: OrchestratorRequest


# Enum routing for Ollama/custom local models: they pass the user message as args to the
# zero-arg tool delegates below, which reject it, so pick a capability by name and dispatch in Python.
_RouteCapability = Literal["pdf_edit", "pdf_question", "user_spec", "pdf_review", "pdf_create", "unsupported"]


class _RouteDecision(ApiModel):
    # Local models add stray tool args and send null for optional fields; tolerate both.
    model_config = ConfigDict(extra="ignore")
    capability: _RouteCapability
    message: str | None = Field(
        default=None,
        description="Only for capability='unsupported': a short, helpful message to show the user.",
    )


class _ProcessorRouteDecision(ApiModel):
    """`_RouteDecision` narrowed to what the processor can reach.

    A sibling rather than a subclass: narrowing a mutable field in a subclass is an
    incompatible override. Declared statically rather than built from a dynamic Literal so the
    `match` in `_route_and_dispatch` stays exhaustive and `assert_never` keeps typechecking.
    """

    model_config = ConfigDict(extra="ignore")
    capability: Literal["user_spec", "unsupported"]
    message: str | None = Field(
        default=None,
        description="Only for capability='unsupported': a short, helpful message to show the user.",
    )


# The route name each capability is known by in the prompts and the enum router.
_ROUTE_NAME: dict[SupportedCapability, str] = {
    SupportedCapability.PDF_EDIT: "pdf_edit",
    SupportedCapability.PDF_QUESTION: "pdf_question",
    SupportedCapability.AGENT_DRAFT: "user_spec",
    SupportedCapability.PDF_REVIEW: "pdf_review",
    SupportedCapability.PDF_CREATE: "pdf_create",
}

_ROUTER_BULLETS: dict[SupportedCapability, str] = {
    SupportedCapability.PDF_EDIT: "- pdf_edit: modify or convert one or more attached PDFs.",
    SupportedCapability.PDF_QUESTION: "- pdf_question: answer questions about the contents of the attached PDFs.",
    SupportedCapability.AGENT_DRAFT: "- user_spec: create or define an agent spec.",
    SupportedCapability.PDF_REVIEW: "- pdf_review: return the PDF with review comments/annotations attached.",
    SupportedCapability.PDF_CREATE: (
        "- pdf_create: generate a NEW document from scratch (invoice, report, letter) - no input file."
    ),
}

# Worked examples, filtered alongside the bullets: teaching the processor router four
# document-shaped examples actively fights the gate.
_ROUTER_EXAMPLES: dict[SupportedCapability, str] = {
    SupportedCapability.PDF_QUESTION: '  "Is there a table of contents?" -> pdf_question',
    SupportedCapability.PDF_EDIT: '  "Add a table of contents" -> pdf_edit',
    SupportedCapability.PDF_REVIEW: '  "Put a note on every paragraph that needs work" -> pdf_review',
    SupportedCapability.PDF_CREATE: '  "Build me a purchase order from scratch" -> pdf_create',
    SupportedCapability.AGENT_DRAFT: '  "Make a rule that stamps every upload" -> user_spec',
}

_CAPABILITY_BY_ROUTE: dict[str, SupportedCapability] = {name: cap for cap, name in _ROUTE_NAME.items()}

_DOCUMENT_CAPABILITIES = frozenset(
    {
        SupportedCapability.PDF_EDIT,
        SupportedCapability.PDF_QUESTION,
        SupportedCapability.PDF_REVIEW,
        SupportedCapability.PDF_CREATE,
    }
)

# Every capability the orchestrator can delegate to, i.e. the editor set.
_EDITOR_ALL = capabilities_for(AssistantSurface.EDITOR)


def _ordered(allowed: frozenset[SupportedCapability], source: dict[SupportedCapability, str]) -> list[str]:
    """Entries of `source` for `allowed`, in `source`'s declaration order (stable prompts)."""
    return [text for capability, text in source.items() if capability in allowed]


def _router_instructions(allowed: frozenset[SupportedCapability]) -> str:
    lines = [
        "You are the top-level router. Choose exactly one capability that best handles the request:",
        *_ordered(allowed, _ROUTER_BULLETS),
        "- unsupported: none of the above fit, or the user asks about the assistant itself; put a "
        "helpful message in 'message'.",
        "Respond with the capability and (only for unsupported) a message.",
        "",
    ]
    if _DOCUMENT_CAPABILITIES & allowed:
        lines.append(
            "Decide by what the user wants BACK. Information read out of the document is "
            "pdf_question; a changed file handed back is pdf_edit. Mentioning a document is not "
            "asking to change it."
        )
    else:
        lines.append(
            "You are running in the processor, an automation console with no file workspace. The "
            "user cannot attach or select a document here, so you can never edit, read, annotate "
            "or create one. Anything document-shaped is 'unsupported' — say so plainly and offer "
            "to turn it into a rule that runs on every file instead."
        )
    lines.extend(_ordered(allowed, _ROUTER_EXAMPLES))
    lines.append('  "Which version of the app is this?" -> unsupported')
    return "\n".join(lines)


def _router_model_settings(runtime: AppRuntime) -> ModelSettings:
    return {**runtime.fast_model_settings, "temperature": 0.0}


class OrchestratorAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        # Keyed so a run can be given a narrowed subset. Descriptions stay declared once.
        self._delegate_outputs: dict[SupportedCapability, ToolOutput[Any]] = {
            SupportedCapability.PDF_EDIT: ToolOutput(
                self.delegate_pdf_edit,
                name="delegate_pdf_edit",
                description="Delegate requests to modify or convert PDFs and return the PDF edit result.",
            ),
            SupportedCapability.PDF_QUESTION: ToolOutput(
                self.delegate_pdf_question,
                name="delegate_pdf_question",
                description="Delegate questions about PDF contents and return the PDF question result.",
            ),
            SupportedCapability.AGENT_DRAFT: ToolOutput(
                self.delegate_user_spec,
                name="delegate_user_spec",
                description="Delegate requests to create or revise a user agent spec and return the draft result.",
            ),
            SupportedCapability.PDF_REVIEW: ToolOutput(
                self.delegate_pdf_review,
                name="delegate_pdf_review",
                description=(
                    "Delegate requests to review a PDF and leave review comments, notes, or"
                    " sticky-note annotations on the document itself. Use this when the user"
                    " wants the PDF returned with comments attached (e.g. 'review this',"
                    " 'add review comments', 'flag unclear sentences', 'annotate with"
                    " feedback')."
                ),
            ),
            SupportedCapability.PDF_CREATE: ToolOutput(
                self.delegate_pdf_create,
                name="delegate_pdf_create",
                description=(
                    "Delegate requests to create a new PDF document from scratch based on a"
                    " description. Use this when the user wants to generate a new document"
                    " (e.g. 'create an invoice', 'write a report', 'make a contract',"
                    " 'draft a letter'). No input file is required."
                ),
            ),
        }
        self._unsupported_output = ToolOutput(
            self.unsupported_capability,
            name="unsupported_capability",
            description="Return this when none of the delegate outputs fit the request.",
        )
        self.agent = Agent(
            model=runtime.fast_model,
            output_type=self._output_types(_EDITOR_ALL),
            # Local models pick a delegate less reliably; extra retries. No-op for real providers.
            retries=output_retries(runtime.settings.chat_provider),
            deps_type=OrchestratorDeps,
            # No system_prompt: both prompts name the delegates, so they are generated per run
            # from the allowed set. Handing the model a prompt that insists on a function absent
            # from its schema produces retry storms and hallucinated success.
            model_settings=runtime.fast_model_settings,
        )
        # Local models can't drive the zero-arg tool delegates; route by name instead (#6163: unify these paths).
        self._route_via_enum = uses_tool_output(runtime.settings.chat_provider)
        # The router has no tools, so NativeOutput works on Ollama here; a lone output tool
        # would tempt a local model to answer in plain text and never call it.
        self._router = (
            Agent(
                model=runtime.fast_model,
                output_type=NativeOutput([_RouteDecision]),
                retries=output_retries(runtime.settings.chat_provider),
                model_settings=_router_model_settings(runtime),
            )
            if self._route_via_enum
            else None
        )

    def _output_types(self, allowed: frozenset[SupportedCapability]) -> list[ToolOutput[Any]]:
        """Delegate outputs for `allowed`, plus the always-available refusal.

        `unsupported_capability` is never filtered out: with everything else removed it is the
        only thing the model can emit, and an empty output_type is not a valid agent.
        """
        return [output for capability, output in self._delegate_outputs.items() if capability in allowed] + [
            self._unsupported_output
        ]

    def _agent_instructions(self, allowed: frozenset[SupportedCapability]) -> str:
        guidance: dict[SupportedCapability, str] = {
            SupportedCapability.PDF_EDIT: (
                "Use delegate_pdf_edit for any request to modify or convert one or more PDFs."
            ),
            SupportedCapability.PDF_QUESTION: (
                "Use delegate_pdf_question for questions about the contents of the attached PDFs."
            ),
            SupportedCapability.AGENT_DRAFT: ("Use delegate_user_spec for requests to create or define an agent spec."),
            SupportedCapability.PDF_REVIEW: (
                "Use delegate_pdf_review when the user wants the PDF returned with review comments"
                " attached — anything like 'review this', 'annotate with comments', 'leave feedback"
                " on the PDF'."
            ),
            SupportedCapability.PDF_CREATE: (
                "Use delegate_pdf_create when the user wants to generate a new document from"
                " scratch with no input file — invoices, reports, letters, contracts, etc."
            ),
        }
        lines = [
            "You are the top-level orchestrator.",
            "Choose exactly one output function that best handles the request.",
            *_ordered(allowed, guidance),
        ]
        if not (_DOCUMENT_CAPABILITIES & allowed):
            lines.append(
                "You are running in the processor, an automation console with no file workspace."
                " The user cannot attach or select a document here, so you can never edit, read,"
                " annotate or create one. For anything document-shaped call"
                " unsupported_capability, say plainly that document work belongs in the editor,"
                " and offer to turn it into a rule that runs on every file instead. Never claim"
                " to have changed, created or read a document."
            )
        lines.append(
            "Use unsupported_capability when the user asks about the assistant itself or when none"
            " of the other outputs fit; supply a helpful message."
        )
        return " ".join(lines)

    async def handle(self, request: OrchestratorRequest) -> OrchestratorResponse:
        # Bound once; delegates and worker tasks inherit it.
        set_reply_locale(request.locale)
        logger.info(
            "[orchestrator] handle: files=%s resume_with=%s artifacts=%s msg=%r",
            [file.name for file in request.files],
            request.resume_with,
            [type(a).__name__ for a in request.artifacts],
            request.user_message,
        )
        allowed = capabilities_for(request.surface)
        # Before the resume branch: `_resume` never calls a model, so a gate placed only in the
        # routers is bypassed by every multi-turn continuation.
        if request.resume_with is not None:
            if not allows(request.surface, request.resume_with):
                return self._declined(request)
            return await self._resume(request, request.resume_with)
        if self._router is not None:
            return await self._route_and_dispatch(request, allowed)
        result = await self.agent.run(
            self._build_prompt(request),
            deps=OrchestratorDeps(runtime=self.runtime, request=request),
            output_type=self._output_types(allowed),
            instructions=self._agent_instructions(allowed),
        )
        logger.info("[orchestrator] routed -> %s", type(result.output).__name__)
        return result.output

    def _declined(self, request: OrchestratorRequest) -> UnsupportedCapabilityResponse:
        logger.info("[orchestrator] declined document work on surface=%s", request.surface)
        return UnsupportedCapabilityResponse(
            capability="document_work",
            message=document_work_decline(request.surface),
        )

    async def _route_and_dispatch(
        self, request: OrchestratorRequest, allowed: frozenset[SupportedCapability]
    ) -> OrchestratorResponse:
        """Local-model routing: pick a capability by name, then dispatch in Python."""
        assert self._router is not None
        result = await self._router.run(
            self._build_prompt(request),
            output_type=NativeOutput([_RouteDecision if _DOCUMENT_CAPABILITIES & allowed else _ProcessorRouteDecision]),
            instructions=_router_instructions(allowed),
        )
        decision = result.output
        logger.info("[orchestrator] enum-routed -> %s", decision.capability)
        # The narrowed schema should make this unreachable, but a local model that ignores its
        # schema must not become the one path that skips the gate.
        routed = _CAPABILITY_BY_ROUTE.get(decision.capability)
        if routed is not None and not allows(request.surface, routed):
            return self._declined(request)
        match decision.capability:
            case "pdf_edit":
                return await self._run_pdf_edit(request)
            case "pdf_question":
                return await self._run_pdf_question(request)
            case "user_spec":
                return await self._run_agent_draft(request)
            case "pdf_review":
                return await self._run_pdf_review(request)
            case "pdf_create":
                return await self._run_pdf_create(request)
            case "unsupported":
                return UnsupportedCapabilityResponse(
                    capability="orchestrate",
                    message=decision.message or "I can't help with that request.",
                )
            case _ as unreachable:
                assert_never(unreachable)

    async def _resume(self, request: OrchestratorRequest, capability: SupportedCapability) -> OrchestratorResponse:
        """Fast-path to get back to the correct endpoint without having to call AI.

        Also the entry point for the *multi-turn* flow where a delegate emits a plan with
        ``resume_with`` set — Java runs the plan, captures any tool reports as artifacts, and
        re-enters via this method so the delegate can digest the reports.
        """
        match capability:
            case SupportedCapability.PDF_QUESTION:
                return await self._run_pdf_question(request)
            case SupportedCapability.PDF_REVIEW:
                return await self._run_pdf_review(request)
            case SupportedCapability.PDF_EDIT:
                return await self._run_pdf_edit(request)
            case SupportedCapability.AGENT_DRAFT:
                return await self._run_agent_draft(request)
            case SupportedCapability.PDF_CREATE:
                return await self._run_pdf_create(request)
            case (
                SupportedCapability.ORCHESTRATE
                | SupportedCapability.AGENT_REVISE
                | SupportedCapability.AGENT_NEXT_ACTION
                | SupportedCapability.MATH_AUDITOR_AGENT
            ):
                raise ValueError(f"Cannot resume orchestrator with capability: {capability}")
            case _ as unreachable:
                assert_never(unreachable)

    async def delegate_pdf_edit(self, ctx: RunContext[OrchestratorDeps]) -> PdfEditResponse:
        return await self._run_pdf_edit(ctx.deps.request)

    async def _run_pdf_edit(self, request: OrchestratorRequest) -> PdfEditResponse:
        return await PdfEditAgent(self.runtime).orchestrate(request)

    async def delegate_pdf_question(self, ctx: RunContext[OrchestratorDeps]) -> PdfQuestionOrchestrateResponse:
        return await self._run_pdf_question(ctx.deps.request)

    async def _run_pdf_question(self, request: OrchestratorRequest) -> PdfQuestionOrchestrateResponse:
        return await PdfQuestionAgent(self.runtime).orchestrate(request)

    async def delegate_user_spec(self, ctx: RunContext[OrchestratorDeps]) -> AgentDraftWorkflowResponse:
        return await self._run_agent_draft(ctx.deps.request)

    async def _run_agent_draft(self, request: OrchestratorRequest) -> AgentDraftWorkflowResponse:
        return await UserSpecAgent(self.runtime).orchestrate(request)

    async def delegate_pdf_review(self, ctx: RunContext[OrchestratorDeps]) -> PdfReviewOrchestrateResponse:
        return await self._run_pdf_review(ctx.deps.request)

    async def _run_pdf_review(self, request: OrchestratorRequest) -> PdfReviewOrchestrateResponse:
        return await PdfReviewAgent(self.runtime).orchestrate(request)

    async def delegate_pdf_create(self, ctx: RunContext[OrchestratorDeps]) -> PdfCreateOrchestrateResponse:
        return await self._run_pdf_create(ctx.deps.request)

    async def _run_pdf_create(self, request: OrchestratorRequest) -> PdfCreateOrchestrateResponse:
        return await PdfCreateAgent(self.runtime).orchestrate(request)

    async def unsupported_capability(
        self,
        ctx: RunContext[OrchestratorDeps],
        capability: str,
        message: str,
    ) -> UnsupportedCapabilityResponse:
        return UnsupportedCapabilityResponse(capability=capability, message=message)

    def _build_prompt(self, request: OrchestratorRequest) -> str:
        artifact_summary = self._describe_artifacts(request)
        history = format_conversation_history(request.conversation_history)
        return (
            f"Conversation history:\n{history}\n"
            f"User message: {request.user_message}\n"
            f"Files: {format_file_names(request.files)}\n"
            f"Available artifacts:\n{artifact_summary}"
            f"\n{language_directive()}"
        )

    def _describe_artifacts(self, request: OrchestratorRequest) -> str:
        if not request.artifacts:
            return "- none"

        descriptions: list[str] = []
        for artifact in request.artifacts:
            if isinstance(artifact, ExtractedTextArtifact):
                total_pages = sum(len(f.pages) for f in artifact.files)
                file_names = [f.file_name for f in artifact.files]
                descriptions.append(f"- extracted_text: {total_pages} pages from {file_names}")
                continue
            descriptions.append("- unknown artifact")
        return "\n".join(descriptions)
