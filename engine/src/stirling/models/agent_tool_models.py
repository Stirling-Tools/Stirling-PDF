"""Agent tool IDs, parameter models, and registry.

tool_models.py is auto-generated from the Java OpenAPI spec. This file is its
manually-maintained counterpart for tools backed by AI agent pipelines.
"""

from __future__ import annotations

from enum import StrEnum

from stirling.models.base import ApiModel
from stirling.models.tool_models import ParamToolModel, ToolEndpoint


class AgentToolId(StrEnum):
    MATH_AUDITOR_AGENT = "/api/v1/ai/tools/math-auditor-agent"
    PDF_TO_MARKDOWN_AGENT = "pdfToMarkdownAgent"
    PDF_COMMENT_AGENT = "/api/v1/ai/tools/pdf-comment-agent"


class MathAuditorAgentParams(ApiModel):
    tolerance: str = "0.01"


class PdfToMarkdownAgentParams(ApiModel):
    user_message: str = ""


class PdfCommentAgentParams(ApiModel):
    prompt: str | None = None


type AgentParamModel = MathAuditorAgentParams | PdfToMarkdownAgentParams | PdfCommentAgentParams

type AnyToolId = ToolEndpoint | AgentToolId
type AnyParamModel = ParamToolModel | AgentParamModel

AGENT_OPERATIONS: dict[AgentToolId, type[AgentParamModel]] = {
    AgentToolId.MATH_AUDITOR_AGENT: MathAuditorAgentParams,
    AgentToolId.PDF_TO_MARKDOWN_AGENT: PdfToMarkdownAgentParams,
    AgentToolId.PDF_COMMENT_AGENT: PdfCommentAgentParams,
}
