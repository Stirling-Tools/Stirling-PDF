"""Streaming orchestrator that routes chat requests to registered agents."""

from __future__ import annotations

from typing import Literal

from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.agents.registry import AgentRegistry
from stirling.contracts.chat import ChatRequest
from stirling.models import ApiModel
from stirling.services import AppRuntime
from stirling.streaming import EventEmitter


class AgentSelection(ApiModel):
    """The orchestrator's choice of which agent to delegate to."""

    outcome: Literal["delegate"] = "delegate"
    agent_id: str
    reasoning: str


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

    def _build_system_prompt(self) -> str:
        agent_descriptions = []
        for meta in self.registry.list_all():
            agent_descriptions.append(f"- **{meta.agent_id}**: {meta.name} — {meta.description}")
        agents_text = "\n".join(agent_descriptions)

        return (
            "You are the top-level orchestrator for a PDF intelligence system. "
            "Based on the user's message, choose exactly one agent to delegate to. "
            "Return the agent_id of the best-matching agent and a brief reasoning. "
            "If no agent can handle the request, return unsupported with an explanation.\n\n"
            "IMPORTANT: When the prompt includes [Active documents: ...], documents ARE loaded "
            "When [Document text is available], the text has already been extracted and will be "
            "passed to the agent automatically.\n\n"
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

        routing_agent = Agent(
            model=self.runtime.fast_model,
            output_type=NativeOutput([AgentSelection, UnsupportedRequest]),
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

        if isinstance(selection, UnsupportedRequest):
            emitter.token(orch_id, selection.message)
            emitter.agent_complete(orch_id, status="success", result_summary="Unsupported request")
            emitter.done()
            return

        # Delegate to the selected agent
        try:
            agent = self._get_or_create_agent(selection.agent_id)
        except KeyError:
            emitter.token(orch_id, f"Agent '{selection.agent_id}' was selected but is not available.")
            emitter.agent_complete(orch_id, status="error", result_summary="Agent not found")
            emitter.done()
            return

        try:
            await agent.handle(request, emitter, parent_agent_id=orch_id)  # type: ignore[union-attr]
        except Exception as exc:
            emitter.error(orch_id, str(exc))

        emitter.agent_complete(orch_id, status="success", result_summary=f"Routed to {selection.agent_id}")
        emitter.done()
