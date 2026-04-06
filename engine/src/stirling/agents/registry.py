"""Agent registry for dynamic discovery and orchestration."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from stirling.services import AppRuntime


@dataclass(frozen=True)
class AgentMeta:
    """Metadata for a registered chat agent."""

    agent_id: str
    name: str
    description: str
    category: str
    agent_factory: Callable[[AppRuntime], Any]


class AgentRegistry:
    """Registry that chat agents register themselves into.

    The streaming orchestrator reads this to build its system prompt
    and delegate functions dynamically.  Adding a new agent requires
    only writing the agent class and calling ``registry.register()``.
    """

    def __init__(self) -> None:
        self._agents: dict[str, AgentMeta] = {}

    def register(self, meta: AgentMeta) -> None:
        if meta.agent_id in self._agents:
            raise ValueError(f"Agent '{meta.agent_id}' is already registered.")
        self._agents[meta.agent_id] = meta

    def get(self, agent_id: str) -> AgentMeta:
        try:
            return self._agents[agent_id]
        except KeyError:
            raise KeyError(f"No agent registered with id '{agent_id}'") from None

    def list_all(self) -> list[AgentMeta]:
        return list(self._agents.values())
