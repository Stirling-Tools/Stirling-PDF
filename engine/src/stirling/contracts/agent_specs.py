from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from stirling.models import ApiModel, OperationId

from .common import ToolOperationStep


class AiToolAgentStep(ApiModel):
    kind: Literal["ai_tool"] = "ai_tool"
    title: str
    description: str
    tool: OperationId
    instruction: str


AgentSpecStep = Annotated[ToolOperationStep | AiToolAgentStep, Field(discriminator="kind")]


class AgentSpec(ApiModel):
    name: str
    description: str
    objective: str
    steps: list[AgentSpecStep] = Field(default_factory=list)
