from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from stirling.models.base import ApiModel
from stirling.models.tool_models import OperationId

from .common import ToolOperationStep


class ToolAgentStep(ApiModel):
    kind: Literal["tool"] = "tool"
    title: str
    description: str
    tool_step: ToolOperationStep


class AiToolAgentStep(ApiModel):
    kind: Literal["ai_tool"] = "ai_tool"
    title: str
    description: str
    tool: OperationId
    instruction: str


AgentSpecStep = Annotated[ToolAgentStep | AiToolAgentStep, Field(discriminator="kind")]


class AgentSpec(ApiModel):
    name: str
    description: str
    objective: str
    steps: list[AgentSpecStep] = Field(default_factory=list)
