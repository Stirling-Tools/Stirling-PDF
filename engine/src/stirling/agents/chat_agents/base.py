"""Base protocol for all chat agents."""

from __future__ import annotations

from typing import Protocol

from stirling.contracts.chat import ChatRequest
from stirling.streaming import EventEmitter


class BaseChatAgent(Protocol):
    """Protocol that every chat agent must satisfy.

    Agents receive the shared ``EventEmitter`` and are responsible for
    emitting their own ``agent_start`` / ``agent_complete`` events as
    well as any sub-agent events.
    """

    async def handle(self, request: ChatRequest, emitter: EventEmitter, parent_agent_id: str | None = None) -> None:
        ...
