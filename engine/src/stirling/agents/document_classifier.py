from __future__ import annotations

import logging

from pydantic import Field
from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.contracts import (
    ClassifyDocumentRequest,
    ClassifyDocumentResponse,
    ConsideredLabel,
    DocumentClassificationResponse,
    LabelAssignment,
    LabelOption,
    PageText,
)
from stirling.models import ApiModel
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)

# A document carries at most this many labels; anything past the cap is dropped
# in the model's order.
MAX_ASSIGNED_LABELS = 5
# Near-misses are capped too. Each one the caller watches becomes a reason on a
# durable review item, so an unbounded list would let one answer bloat a stored
# record (and the reviewer's screen) with the long tail of things it almost said.
MAX_CONSIDERED_LABELS = 5
# Pages read from each end of the document. A document's type is evident from
# its opening (and closing) pages, so a fixed window keeps cost and latency flat
# regardless of length. Promote to AppSettings if it ever needs tuning.
WINDOW_PAGES = 2


_SYSTEM_PROMPT = (
    "You identify what a document is by assigning labels, choosing only from a "
    "fixed list of allowed labels you are given.\n"
    "\n"
    "Rules:\n"
    f"- Assign up to {MAX_ASSIGNED_LABELS} labels that describe this document's type.\n"
    "- Only use labels from the allowed list, spelled exactly as listed.\n"
    "- Give every assigned label a calibrated confidence between 0 and 1 — how "
    "sure you are that the label applies.\n"
    "- If you seriously considered a label — especially a consequential one, such "
    "as a medical or legal document — but were not sure enough to assign it, do "
    "not silently drop it: list it as considered, with a LOW confidence "
    "reflecting your uncertainty and a one-line reason.\n"
    "- Assign nothing if no label fits; leave considered empty if you weighed "
    "nothing seriously.\n"
    "- Judge from the document's content and structure, not from keywords alone. "
    "The document may be in any language.\n"
    "- You are shown only the first and last pages; that is enough to identify the type."
)


class _AssignedLabel(ApiModel):
    """One label the model assigns, by name, with its calibrated confidence."""

    label: str = Field(
        description="A label from the allowed list, spelled exactly as listed.",
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Calibrated confidence that the label applies, from 0 to 1.",
    )


class _ConsideredLabel(ApiModel):
    """A label the model weighed seriously but was not sure enough to assign."""

    label: str = Field(
        description="A label from the allowed list, spelled exactly as listed.",
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description=("How sure you are that the label applies — low, since you did not assign it."),
    )
    reason: str = Field(
        description="One short line on why you considered the label but did not assign it.",
    )


class _ClassifierOutput(ApiModel):
    """Raw model answer, before it is validated against the allowed vocabulary."""

    assignments: list[_AssignedLabel] = Field(
        default_factory=list,
        description="Labels from the allowed list that describe this document's type.",
    )
    considered: list[_ConsideredLabel] = Field(
        default_factory=list,
        description=("Labels you seriously considered but were not sure enough to assign."),
    )


def render_labels(labels: list[LabelOption]) -> str:
    """Render the allowed vocabulary for the prompt — the model reasons over the
    human names (it never sees ids)."""
    names = [label.name for label in labels]
    return f"Allowed labels: {', '.join(names) or '(none)'}"


def select_window(pages: list[PageText], window: int = WINDOW_PAGES) -> list[PageText]:
    """Return the first and last ``window`` pages, never overlapping.

    Documents short enough that the two ends would meet are returned whole. The
    caller usually sends just the window already; this is a defensive trim in
    case it sends more.
    """
    if window <= 0 or len(pages) <= window * 2:
        return list(pages)
    return [*pages[:window], *pages[-window:]]


def format_window(pages: list[PageText]) -> str:
    if not pages:
        return "(no extractable text)"
    return "\n\n".join(f"[Page {page.page_number}]\n{page.text}" for page in pages)


def validate_labels(output: _ClassifierOutput, allowed: list[LabelOption]) -> DocumentClassificationResponse:
    """Coerce a raw model answer (names) onto the allowed vocabulary, returning
    label **ids**.

    The model answers with names; they are matched case-insensitively to the
    allowed vocabulary and returned as that label's id. Anything off-list is
    dropped, duplicates collapse to the first occurrence, and assignments are
    capped at ``MAX_ASSIGNED_LABELS`` in the model's order. ``considered``
    follows the same matching and dedup rules, is capped at
    ``MAX_CONSIDERED_LABELS``, and may not repeat an assigned label. ``labels``
    is derived from the surviving assignments, so the two can never disagree.
    The model identifies; these rules decide what is allowed to stand.
    """
    id_by_lower_name = {label.name.lower(): label.id for label in allowed}

    assignments: list[LabelAssignment] = []
    assigned_ids: list[str] = []
    for assigned in output.assignments:
        label_id = id_by_lower_name.get(assigned.label.strip().lower())
        if label_id is not None and label_id not in assigned_ids:
            assigned_ids.append(label_id)
            assignments.append(LabelAssignment(label_id=label_id, confidence=assigned.confidence))
        if len(assignments) == MAX_ASSIGNED_LABELS:
            break

    considered: list[ConsideredLabel] = []
    considered_ids: list[str] = []
    for candidate in output.considered:
        label_id = id_by_lower_name.get(candidate.label.strip().lower())
        if label_id is None or label_id in assigned_ids or label_id in considered_ids:
            continue
        considered_ids.append(label_id)
        considered.append(ConsideredLabel(label_id=label_id, confidence=candidate.confidence, reason=candidate.reason))
        if len(considered) == MAX_CONSIDERED_LABELS:
            break

    return DocumentClassificationResponse(labels=assigned_ids, assignments=assignments, considered=considered)


class DocumentClassifierAgent:
    """Assigns labels to a document from an allowed vocabulary.

    Reads the bounded page window supplied on the request (first/last
    ``WINDOW_PAGES``) and runs a single fast-model pass, then validates the
    answer against the vocabulary so nothing off-list survives.
    """

    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self._agent = Agent(
            model=runtime.fast_model,
            output_type=NativeOutput(_ClassifierOutput),
            system_prompt=_SYSTEM_PROMPT,
            model_settings=runtime.fast_model_settings,
        )

    async def classify(self, request: ClassifyDocumentRequest) -> ClassifyDocumentResponse:
        # The caller (the backend) always supplies the allowed vocabulary — its
        # fixed built-in label set — so the engine holds no vocabulary of its own.
        allowed = request.labels
        window = select_window(request.pages)
        prompt = self._build_prompt(request.file_name, allowed, window)
        logger.debug("[classify] prompt:\n%s", prompt)
        result = await self._agent.run(prompt)
        return validate_labels(result.output, allowed)

    @staticmethod
    def _build_prompt(file_name: str, allowed: list[LabelOption], window: list[PageText]) -> str:
        return (
            f"{render_labels(allowed)}\n\n"
            f"Document file name: {file_name}\n"
            f"Document content (first and last pages):\n{format_window(window)}"
        )
