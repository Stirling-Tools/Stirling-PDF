from __future__ import annotations

from typing import Annotated

from pydantic import Field

from .common import NeedIngestResponse
from .pdf_edit import EditPlanResponse

# Mirrors :data:`PdfQuestionOrchestrateResponse` for parity with the
# question agent. ``PdfReviewAgent.orchestrate`` either emits the
# multi-step plan it wants Java to run (review → add-comments) or asks
# Java to ingest the files first via :class:`NeedIngestResponse`.
#
# The discriminated union on ``outcome`` keeps the wire format honest:
# Java sees a single `outcome` field and routes on its value, exactly
# as it does for the question delegate.
type PdfReviewOrchestrateResponse = Annotated[
    EditPlanResponse | NeedIngestResponse,
    Field(discriminator="outcome"),
]
