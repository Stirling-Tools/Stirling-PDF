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

    message: str
    conversation_id: str | None = None
    file_names: list[str] = Field(default_factory=list)
    extracted_text: str | None = None
    history: list[ChatHistoryItem] = Field(default_factory=list)


class AgentMetaResponse(ApiModel):
    """Public metadata for a registered agent."""

    agent_id: str
    name: str
    description: str
    category: str
