"""Progress events emitted by deep callees during a streaming orchestrator run.

Each subclass models one engine-side phase. The Java side forwards the JSON
verbatim into ``AiWorkflowProgressEvent.engineDetail``; the frontend switches
on ``phase`` and renders the typed fields.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from stirling.models import ApiModel


class WholeDocReadStarted(ApiModel):
    phase: Literal["whole_doc_read_started"] = "whole_doc_read_started"
    question: str
    pages: int
    slices: int


class WholeDocSliceDone(ApiModel):
    """Emitted as each chunked-reasoner worker completes.

    ``completed`` is a monotonically increasing counter (1..total) reflecting
    the order in which workers finished, NOT the slice's position in the
    document. Callers showing "Read X of Y" should use this directly so X
    increments by one with each event.
    """

    phase: Literal["whole_doc_slice_done"] = "whole_doc_slice_done"
    completed: int
    total: int
    pages: str
    duration_ms: int
    excerpts: int
    facts: int


class WholeDocReadDone(ApiModel):
    phase: Literal["whole_doc_read_done"] = "whole_doc_read_done"
    completed: int
    slices: int
    duration_seconds: float


type ProgressEvent = Annotated[
    WholeDocReadStarted | WholeDocSliceDone | WholeDocReadDone,
    Field(discriminator="phase"),
]
