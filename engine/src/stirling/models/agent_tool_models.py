"""Agent tool IDs, parameter models, and registry.

Hand-maintained counterpart to the generated tool_models.py, for engine-emitted tools
hidden from the OpenAPI spec: AI-backed agents and deterministic conversions like HTML-to-PDF.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import Field

from stirling.models.base import ApiModel
from stirling.models.tool_models import ParamToolModel, ToolEndpoint


class AgentToolId(StrEnum):
    MATH_AUDITOR_AGENT = "/api/v1/ai/tools/math-auditor-agent"
    PDF_COMMENT_AGENT = "/api/v1/ai/tools/pdf-comment-agent"
    CREATE_PDF_FROM_HTML_AGENT = "/api/v1/ai/tools/create-pdf-from-html-agent"


class MathAuditorAgentParams(ApiModel):
    tolerance: str = "0.01"


class PdfCommentAgentParams(ApiModel):
    prompt: str | None = None


class CreatePdfFromHtmlAgentParams(ApiModel):
    html_content: str
    filename: str = Field(pattern=r"^.+\.pdf$")


type AgentParamModel = MathAuditorAgentParams | PdfCommentAgentParams | CreatePdfFromHtmlAgentParams

type AnyToolId = ToolEndpoint | AgentToolId
type AnyParamModel = ParamToolModel | AgentParamModel

AGENT_OPERATIONS: dict[AgentToolId, type[AgentParamModel]] = {
    AgentToolId.MATH_AUDITOR_AGENT: MathAuditorAgentParams,
    AgentToolId.PDF_COMMENT_AGENT: PdfCommentAgentParams,
    AgentToolId.CREATE_PDF_FROM_HTML_AGENT: CreatePdfFromHtmlAgentParams,
}
