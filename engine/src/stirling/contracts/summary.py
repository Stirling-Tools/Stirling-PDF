from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from stirling.models import ApiModel

from .common import AiFile, ConversationMessage, NeedIngestResponse, WorkflowOutcome


class SummaryRequest(ApiModel):
    files: list[AiFile] = Field(min_length=1)
    focus: str | None = None
    conversation_history: list[ConversationMessage] = Field(default_factory=list)


class SummarySection(ApiModel):
    heading: str
    summary: str


class SummaryAnswerResponse(ApiModel):
    outcome: Literal[WorkflowOutcome.SUMMARY_ANSWER] = WorkflowOutcome.SUMMARY_ANSWER
    tldr: str
    key_points: list[str] = Field(default_factory=list)
    sections: list[SummarySection] = Field(default_factory=list)


class SummaryNotFoundResponse(ApiModel):
    outcome: Literal[WorkflowOutcome.SUMMARY_NOT_FOUND] = WorkflowOutcome.SUMMARY_NOT_FOUND
    reason: str


type SummaryTerminalResponse = SummaryAnswerResponse | SummaryNotFoundResponse
type SummaryResponse = Annotated[
    SummaryTerminalResponse | NeedIngestResponse,
    Field(discriminator="outcome"),
]
