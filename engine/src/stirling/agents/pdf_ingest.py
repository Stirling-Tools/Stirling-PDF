"""PDF ingest / convert-to-Markdown delegate.

Unlike the other delegates this is not an agent — there is no reasoning to do.
The orchestrator picks it when the user asks to convert a PDF to Markdown or
read its content as text, and Java performs the conversion deterministically.
It is therefore expressed as a standalone descriptor rather than a
``RegisterableAgent``: routable by the orchestrator, but never resumed and not
published to MCP.
"""

from __future__ import annotations

from stirling.agents._registry import AgentDescriptor, OrchestratorRoute
from stirling.contracts import ConvertMarkdownResponse, OrchestratorRequest, SupportedCapability


async def _ingest(request: OrchestratorRequest) -> ConvertMarkdownResponse:
    return ConvertMarkdownResponse(
        reason="PDF to Markdown requested — Java converts deterministically.",
        files_to_ingest=request.files,
    )


def pdf_ingest_descriptor() -> AgentDescriptor:
    return AgentDescriptor(
        orchestrator=OrchestratorRoute(
            capability=SupportedCapability.PDF_TO_MARKDOWN,
            tool_name="delegate_pdf_ingest",
            tool_description=(
                "Delegate any request to convert a PDF to Markdown or extract its content as readable text."
            ),
            orchestrate=_ingest,
            resumable=False,
        ),
    )
