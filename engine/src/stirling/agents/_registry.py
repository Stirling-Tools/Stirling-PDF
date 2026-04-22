"""Registry plumbing for orchestrator delegates.

Each delegate-able agent class exposes a zero-arg ``register_delegate`` (an
instance method for real agents, a classmethod for canned-plan delegates like
the math auditor). App startup builds a list of registrars, calls each, and
hands the resulting :class:`DelegatableAgent` list to
:class:`OrchestratorAgent`, which uses them both to build its ``ToolOutput``
union and to dispatch ``resume_with`` requests. Adding a new delegate therefore
touches only the new agent's module and one append at the startup registration
— the orchestrator itself is left alone.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from pydantic_ai.output import ToolOutput

from stirling.contracts import OrchestratorRequest, OrchestratorResponse, SupportedCapability
from stirling.services import AppRuntime


@dataclass(frozen=True)
class OrchestratorDeps:
    runtime: AppRuntime
    request: OrchestratorRequest


@dataclass(frozen=True)
class DelegatableAgent:
    """One capability the orchestrator can route to."""

    capability: SupportedCapability
    tool_output: ToolOutput[OrchestratorResponse]
    run: Callable[[OrchestratorRequest], Awaitable[OrchestratorResponse]]


class DelegateRegistrar(ABC):
    """Base class for agents that can register themselves as an orchestrator
    delegate. Enforces a uniform ``register_delegate`` entry point that app
    startup calls to produce the :class:`DelegatableAgent`."""

    @abstractmethod
    def register_delegate(self) -> DelegatableAgent: ...
