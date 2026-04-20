from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from stirling.models import ApiModel, ToolEndpoint

from .common import StepKind, ToolOperationStep


class AiToolAgentStep(ApiModel):
    kind: Literal[StepKind.AI_TOOL] = StepKind.AI_TOOL
    title: str
    description: str
    tool: ToolEndpoint
    instruction: str


AgentSpecStep = Annotated[ToolOperationStep | AiToolAgentStep, Field(discriminator="kind")]


class AgentSpec(ApiModel):
    name: str
    description: str
    objective: str
    steps: list[AgentSpecStep] = Field(default_factory=list)
