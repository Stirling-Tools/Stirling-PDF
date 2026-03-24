from __future__ import annotations

from enum import StrEnum
from typing import Protocol

from stirling.models.base import ApiModel


class AiModelKind(StrEnum):
    SMART = "smart"
    FAST = "fast"


class AiMessage(ApiModel):
    role: str
    content: str


class AiRequest(ApiModel):
    model_kind: AiModelKind
    system_prompt: str
    messages: list[AiMessage]


class AiResponse(ApiModel):
    content: str


class AiClient(Protocol):
    async def generate(self, request: AiRequest) -> AiResponse: ...


class UnavailableAiClient:
    async def generate(self, request: AiRequest) -> AiResponse:
        raise RuntimeError(f"AI client is not configured for model kind: {request.model_kind}")
