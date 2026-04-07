"""Contracts for the agent chat streaming system."""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from stirling.models import ApiModel


class ChatHistoryItem(ApiModel):
    """A single message in the conversation history."""

    role: Literal["user", "assistant"]
    content: str


class ChatRequest(ApiModel):
    """Request sent by the frontend to start a streaming chat."""

    message: str = Field(max_length=10_000)
    conversation_id: str | None = Field(default=None, max_length=200)
    file_names: list[str] = Field(default_factory=list, max_length=50)
    extracted_text: str | None = Field(default=None, max_length=500_000)
    history: list[ChatHistoryItem] = Field(default_factory=list, max_length=100)
    agent_id: str | None = Field(
        default=None,
        max_length=50,
        description="If set, skip routing and delegate directly to this agent.",
    )


class AgentMetaResponse(ApiModel):
    """Public metadata for a registered agent."""

    agent_id: str
    name: str
    description: str
    category: str
