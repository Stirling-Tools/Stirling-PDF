"""Agent tool IDs, parameter models, and registry.

tool_models.py is auto-generated from the frontend. This file is its
manually-maintained counterpart for tools backed by AI agent pipelines.
"""

from __future__ import annotations

from enum import StrEnum

from stirling.models.base import ApiModel
from stirling.models.tool_models import OperationId, ParamToolModel


class AgentToolId(StrEnum):
    MATH_AUDITOR_AGENT = "mathAuditorAgent"


class MathAuditorAgentParams(ApiModel):
    tolerance: str = "0.01"


type AgentParamModel = MathAuditorAgentParams

type AnyToolId = OperationId | AgentToolId
type AnyParamModel = ParamToolModel | AgentParamModel

AGENT_OPERATIONS: dict[AgentToolId, type[AgentParamModel]] = {
    AgentToolId.MATH_AUDITOR_AGENT: MathAuditorAgentParams,
}
