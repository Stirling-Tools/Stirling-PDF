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


class WholeDocCompressionRound(ApiModel):
    """Emitted when the gathered slice notes exceed the synthesis context
    budget and the reasoner consolidates them with a fast-model fold pass.

    Long documents (a 3000-page novel produces ~900k chars of raw notes)
    would otherwise overflow the smart-model's prompt. ``notes_in`` is the
    count entering the round; ``groups`` is the number of fold calls fired
    (each producing one consolidated note). One or two rounds usually fit;
    the event fires per round so callers can render "Consolidating notes
    (round N)..." rather than going silent through the fold.
    """

    phase: Literal["whole_doc_compression_round"] = "whole_doc_compression_round"
    round_number: int
    notes_in: int
    groups: int


class WholeDocReadDone(ApiModel):
    phase: Literal["whole_doc_read_done"] = "whole_doc_read_done"
    completed: int
    slices: int
    duration_seconds: float


type ProgressEvent = Annotated[
    WholeDocReadStarted | WholeDocSliceDone | WholeDocCompressionRound | WholeDocReadDone,
    Field(discriminator="phase"),
]
