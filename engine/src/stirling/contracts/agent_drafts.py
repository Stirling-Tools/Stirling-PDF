from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from stirling.models import ApiModel

from .agent_specs import AgentSpecStep
from .common import ConversationMessage, StepKind, WorkflowOutcome
from .pdf_edit import EditCannotDoResponse, EditClarificationRequest


class AgentDraftStep(ApiModel):
    kind: Literal[StepKind.TOOL, StepKind.AI_TOOL]
    title: str
    description: str


class AgentDraft(ApiModel):
    name: str
    description: str
    objective: str
    steps: list[AgentSpecStep] = Field(default_factory=list)


class AgentDraftRequest(ApiModel):
    user_message: str
    conversation_history: list[ConversationMessage] = Field(default_factory=list)


class AgentDraftResponse(ApiModel):
    outcome: Literal[WorkflowOutcome.DRAFT] = WorkflowOutcome.DRAFT
    draft: AgentDraft


class AgentRevisionRequest(ApiModel):
    user_message: str
    conversation_history: list[ConversationMessage] = Field(default_factory=list)
    current_draft: AgentDraft


class AgentRevisionResponse(ApiModel):
    outcome: Literal[WorkflowOutcome.DRAFT] = WorkflowOutcome.DRAFT
    draft: AgentDraft


AgentDraftWorkflowResponse = Annotated[
    AgentDraftResponse | EditClarificationRequest | EditCannotDoResponse,
    Field(discriminator="outcome"),
]


AgentRevisionWorkflowResponse = Annotated[
    AgentRevisionResponse | EditClarificationRequest | EditCannotDoResponse,
    Field(discriminator="outcome"),
]
