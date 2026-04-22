"""Agent tool IDs, parameter models, and registry.

tool_models.py is auto-generated from the Java OpenAPI spec. This file is its
manually-maintained counterpart for tools backed by AI agent pipelines that
cannot be expressed as a regular POST endpoint (multi-round protocols, etc.).

Note: plain AI-composed tools (chunk extraction + engine call + annotation)
belong in tool_models.py as regular /api/v1/misc/* endpoints. Only protocols
that can't be modelled as a single stateless POST live here.
"""

from __future__ import annotations

from enum import StrEnum

from stirling.models.base import ApiModel
from stirling.models.tool_models import ParamToolModel, ToolEndpoint


class AgentToolId(StrEnum):
    MATH_AUDITOR_AGENT = "mathAuditorAgent"


class MathAuditorAgentParams(ApiModel):
    tolerance: str = "0.01"


type AgentParamModel = MathAuditorAgentParams

type AnyToolId = ToolEndpoint | AgentToolId
type AnyParamModel = ParamToolModel | AgentParamModel

AGENT_OPERATIONS: dict[AgentToolId, type[AgentParamModel]] = {
    AgentToolId.MATH_AUDITOR_AGENT: MathAuditorAgentParams,
}
