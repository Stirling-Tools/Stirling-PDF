"""Agent tool IDs, parameter models, and registry.

tool_models.py is auto-generated from the Java OpenAPI spec. This file is its
manually-maintained counterpart for tools backed by AI agent pipelines.
"""

from __future__ import annotations

from enum import StrEnum

from stirling.models.base import ApiModel
from stirling.models.tool_models import ParamToolModel, ToolEndpoint


class AgentToolId(StrEnum):
    MATH_AUDITOR_AGENT = "mathAuditorAgent"
    PDF_COMMENT_AGENT = "pdfCommentAgent"


class MathAuditorAgentParams(ApiModel):
    tolerance: str = "0.01"


class PdfCommentAgentParams(ApiModel):
    prompt: str


type AgentParamModel = MathAuditorAgentParams | PdfCommentAgentParams

type AnyToolId = ToolEndpoint | AgentToolId
type AnyParamModel = ParamToolModel | AgentParamModel

AGENT_OPERATIONS: dict[AgentToolId, type[AgentParamModel]] = {
    AgentToolId.MATH_AUDITOR_AGENT: MathAuditorAgentParams,
    AgentToolId.PDF_COMMENT_AGENT: PdfCommentAgentParams,
}
