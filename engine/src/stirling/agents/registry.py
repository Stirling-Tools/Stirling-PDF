"""Single source of truth for how each agent is exposed.

An agent declares one :class:`AgentDescriptor` via :meth:`RegisterableAgent.describe`.
Two projections are derived from the collected descriptors, so neither has to be
hand-maintained:

* the **orchestrator** builds its capability classifier and ``resume`` dispatch
  from descriptors whose ``orchestrator`` route is set;
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

from stirling.contracts import OrchestratorRequest, OrchestratorResponse, SupportedCapability

OrchestrateFn = Callable[[OrchestratorRequest], Awaitable[OrchestratorResponse]]


@dataclass(frozen=True)
class OrchestratorRoute:
    """How an agent is exposed to the top-level orchestrator.

    ``capability`` both identifies the option the router picks and keys the resume
    dispatch: the orchestrator re-enters this delegate when a ``resume_with`` of the
    same value arrives. ``description`` is the one-line summary the router sees.
    """

    capability: SupportedCapability
    description: str
    orchestrate: OrchestrateFn


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
