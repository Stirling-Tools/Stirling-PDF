"""Streaming orchestrator that routes chat requests to registered agents."""

from __future__ import annotations

from typing import Literal

from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.agents.registry import AgentRegistry
from stirling.agents.sub_agents.text_extraction import TextExtractionSubAgent
from stirling.contracts.chat import ChatRequest
from stirling.models import ApiModel
from stirling.services import AppRuntime
from stirling.streaming import EventEmitter


class AgentSelection(ApiModel):
    """The orchestrator's choice of which agent to delegate to."""

    outcome: Literal["delegate"] = "delegate"
    agent_id: str
    reasoning: str
    needs_document_text: bool = False
    """Whether the selected agent needs the extracted document text to do its job."""


class DirectResponse(ApiModel):
    """The orchestrator answers the user directly (e.g. capabilities questions)."""

    outcome: Literal["direct"] = "direct"
    message: str


class UnsupportedRequest(ApiModel):
    """The request cannot be handled by any registered agent."""

    outcome: Literal["unsupported"] = "unsupported"
    message: str


class StreamingOrchestrator:
    """Top-level orchestrator that routes chat requests to registered chat agents.

    Reads the ``AgentRegistry`` to dynamically build its system prompt and
    output schema.  Adding a new agent to the registry automatically makes
    it available for routing — no orchestrator changes needed.
    """

    def __init__(self, runtime: AppRuntime, registry: AgentRegistry) -> None:
        self.runtime = runtime
        self.registry = registry
        self._agents_cache: dict[str, object] = {}
        self._text_extraction = TextExtractionSubAgent()

    def _build_system_prompt(self) -> str:
        agent_descriptions = []
        for meta in self.registry.list_all():
            line = f"- **{meta.agent_id}**: {meta.name}"
            if meta.requires_files:
                line += " (requires documents)"
            line += f" — {meta.description}"
            if meta.capabilities:
                line += f"\n  Tools: {', '.join(meta.capabilities)}"
            agent_descriptions.append(line)
        agents_text = "\n".join(agent_descriptions)

        return (
            "You are the top-level orchestrator for Stirling PDF, an intelligent PDF assistant. "
            "Based on the user's message, choose how to respond:\n\n"
            "1. **delegate** — Route to a specific agent when the user wants to perform an action "
            "(summarise, redact, rotate, compress, etc.).\n"
            "   - Set **needs_document_text=true** ONLY when the agent needs to read/analyse "
            "the document content (e.g. summarisation, redaction, content search, Q&A).\n"
            "   - Set **needs_document_text=false** for structural operations that don't need "
            "to read the text (e.g. rotate, compress, merge, split, watermark, OCR, convert, "
            "remove pages, add password, flatten, repair, scale).\n"
            "2. **direct** — Use this when the user asks what you can do, asks for help, "
            "asks about capabilities, or makes general conversation. Write a helpful, "
            "well-formatted markdown response.\n"
            "   CRITICAL RULES for direct responses:\n"
            "   - When listing capabilities: mention EVERY agent by name AND list EVERY "
            "tool from the Tools list below — do NOT summarise or group them, list each one individually.\n"
            "   - When asked about a specific agent or tool: give detailed info about that specific item.\n"
            "   - Use markdown: headings, bold, bullet lists, horizontal rules.\n"
            "   - The agents and tools listed below are your ONLY source of truth. "
            "Do not invent capabilities that are not listed.\n"
            "3. **unsupported** — Only use this when the request is genuinely impossible "
            "(e.g. booking a flight, writing unrelated code). Try hard to find a matching agent "
            "before falling back to unsupported.\n\n"
            "IMPORTANT:\n"
            "- When the prompt includes [Active documents: ...], documents ARE loaded.\n"
            "- When [Document text is available], the text has already been extracted "
            "and will be passed to the agent automatically.\n"
            "- If the user asks for a specific tool operation (e.g. rotate, compress, "
            "merge, watermark, OCR), always route to the agent whose Tools list "
            "includes that operation.\n"
            "- Prefer delegate over direct when an agent can handle the task.\n\n"
            f"Available agents:\n{agents_text}"
        )

    def _get_or_create_agent(self, agent_id: str) -> object:
        if agent_id not in self._agents_cache:
            meta = self.registry.get(agent_id)
            self._agents_cache[agent_id] = meta.agent_factory(self.runtime)
        return self._agents_cache[agent_id]

    def _format_history(self, request: ChatRequest) -> str:
        """Build a prompt string that includes conversation history + current message."""
        parts: list[str] = []
        for item in request.history:
            prefix = "User" if item.role == "user" else "Assistant"
            parts.append(f"{prefix}: {item.content}")
        parts.append(f"User: {request.message}")
        return "\n\n".join(parts)

    async def handle(self, request: ChatRequest, emitter: EventEmitter) -> None:
        orch_id = emitter.agent_start("Orchestrator")

        # Fast path: if the frontend specifies an agent_id, skip routing entirely.
        if request.agent_id:
            await self._delegate(request, request.agent_id, orch_id, emitter)
            return

        # Full routing path: ask the LLM which agent to use.
        routing_agent = Agent(
            model=self.runtime.fast_model,
            output_type=NativeOutput([AgentSelection, DirectResponse, UnsupportedRequest]),
            system_prompt=self._build_system_prompt(),
            model_settings=self.runtime.fast_model_settings,
        )

        prompt = self._format_history(request) if request.history else request.message

        # Add file context so the routing model knows documents are loaded
        if request.file_names:
            file_list = ", ".join(request.file_names)
            prompt = f"[Active documents: {file_list}]\n\n{prompt}"
        if request.extracted_text:
            prompt += f"\n\n[Document text is available ({len(request.extracted_text)} chars)]"

        result = await routing_agent.run(prompt)
        selection = result.output

        if isinstance(selection, DirectResponse):
            emitter.token(orch_id, selection.message)
            emitter.agent_complete(orch_id, status="success", result_summary="Answered directly")
            emitter.done()
            return

        if isinstance(selection, UnsupportedRequest):
            emitter.token(orch_id, selection.message)
            emitter.agent_complete(orch_id, status="success", result_summary="Unsupported request")
            emitter.done()
            return

        await self._delegate(request, selection.agent_id, orch_id, emitter, selection)

    async def _delegate(
        self,
        request: ChatRequest,
        agent_id: str,
        orch_id: str,
        emitter: EventEmitter,
        selection: AgentSelection | None = None,
    ) -> None:
        """Delegate to a specific agent with file/text checks."""
        try:
            meta = self.registry.get(agent_id)
            agent = self._get_or_create_agent(agent_id)
        except KeyError:
            emitter.token(orch_id, f"Agent '{agent_id}' was selected but is not available.")
            emitter.agent_complete(orch_id, status="error", result_summary="Agent not found")
            emitter.done()
            return

        # Check file requirement
        if meta.requires_files and not request.file_names:
            emitter.token(
                orch_id,
                f"I'd use **{meta.name}** to handle this, but no documents are loaded. "
                f"Please upload a PDF first, then try again.",
            )
            emitter.agent_complete(orch_id, status="success", result_summary="No files loaded")
            emitter.done()
            return

        # Run text extraction only when routing decided it's needed AND not already available.
        needs_text = selection.needs_document_text if selection else False
        if needs_text and not request.extracted_text:
            extracted = await self._text_extraction.handle(
                request.extracted_text, emitter, orch_id
            )
            if extracted:
                request = ChatRequest(
                    message=request.message,
                    conversation_id=request.conversation_id,
                    file_names=request.file_names,
                    extracted_text=extracted,
                    history=request.history,
                    agent_id=request.agent_id,
                )

        try:
            await agent.handle(request, emitter, parent_agent_id=orch_id)  # type: ignore[union-attr]
        except Exception as exc:
            emitter.error(orch_id, str(exc))

        emitter.agent_complete(orch_id, status="success", result_summary=f"Routed to {agent_id}")
        emitter.done()
