"""Single source of truth for how each agent is exposed.

An agent declares one :class:`AgentDescriptor` via :meth:`RegisterableAgent.describe`.
Two projections are derived from the collected descriptors, so neither has to be
hand-maintained:

* the **orchestrator** builds its delegate ``ToolOutput`` union and ``resume``
  dispatch from descriptors whose ``orchestrator`` route is set;
* the **MCP capabilities manifest** is built from descriptors' ``mcp`` rows.

Adding an agent therefore means implementing ``describe`` and adding the instance
to ``build_descriptors`` — the orchestrator and the manifest both update for free.

Note: this ``AgentDescriptor`` registry (how an agent is *published*) is unrelated
to the runtime "capability" toolsets like ``ContradictionCapability`` /
``RagCapability`` (tools *injected into* an agent run).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel
from pydantic_ai.output import ToolOutput
from pydantic_ai.tools import RunContext

from stirling.contracts import OrchestratorRequest, OrchestratorResponse, SupportedCapability
from stirling.services import AppRuntime

OrchestrateFn = Callable[[OrchestratorRequest], Awaitable[OrchestratorResponse]]


@dataclass(frozen=True)
class OrchestratorDeps:
    runtime: AppRuntime
    request: OrchestratorRequest


@dataclass(frozen=True)
class OrchestratorRoute:
    """How a capability is exposed to the top-level orchestrator LLM and resume path.

    ``resumable`` marks delegates the orchestrator can re-enter directly via
    ``resume_with`` (the re-entrant reasoning agents). Canned delegates that only
    emit a one-shot response — e.g. PDF→Markdown ingest — set it False and are
    routable but never resumed.
    """

    capability: SupportedCapability
    tool_name: str
    tool_description: str
    orchestrate: OrchestrateFn
    resumable: bool = True

    async def _invoke(self, ctx: RunContext[OrchestratorDeps]) -> OrchestratorResponse:
        return await self.orchestrate(ctx.deps.request)

    def tool_output(self) -> ToolOutput[OrchestratorResponse]:
        return ToolOutput(self._invoke, name=self.tool_name, description=self.tool_description)


@dataclass(frozen=True)
class McpCapability:
    """One row in the MCP capabilities manifest the Java MCP server publishes."""

    id: str
    description: str
    input_model: type[BaseModel]
    mode: Literal["sync", "async"]
    required_scope: str
    route: str


@dataclass(frozen=True)
class AgentDescriptor:
    """How one agent is published. ``orchestrator`` set => routable by the
    top-level orchestrator; ``mcp`` non-empty => exposed in the MCP manifest.
    The two are independent: an agent may be one, the other, or both."""

    orchestrator: OrchestratorRoute | None = None
    mcp: tuple[McpCapability, ...] = ()


class RegisterableAgent(ABC):
    """Base for any agent that publishes itself to the orchestrator and/or MCP.

    Enforces a uniform ``describe`` entry point that startup wiring collects via
    ``build_descriptors``."""

    @abstractmethod
    def describe(self) -> AgentDescriptor: ...
