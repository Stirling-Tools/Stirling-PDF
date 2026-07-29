from __future__ import annotations

from pydantic import Field

from stirling.models import ApiModel

from .documents import PageText


class LabelOption(ApiModel):
    """One allowed label: a stable ``id`` (the identity) plus the human ``name``
    the model actually reasons over. The model picks names; the engine maps its
    answer back to ids, so the result is language- and rename-stable."""

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)


class ClassifyDocumentRequest(ApiModel):
    """Classify one document from its page text.

    The caller sends the page text directly — typically just the bounded window
    (first/last pages), since the classifier reads no more than that. There is no
    ingestion or RAG step.

    ``labels`` is the allowed vocabulary for this request — the caller (the
    backend) always supplies it from the team's stored label set, each an
    ``{id, name}`` pair. The engine holds no vocabulary of its own, so at least
    one label is required.
    """

    file_name: str = Field(min_length=1)
    pages: list[PageText] = Field(default_factory=list)
    labels: list[LabelOption] = Field(min_length=1)


class LabelAssignment(ApiModel):
    """One label the model assigned to the document, with its calibrated
    confidence."""

    label_id: str = Field(
        min_length=1,
        description="Id of the assigned label, from the allowed vocabulary.",
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Calibrated confidence that the label applies, from 0 to 1.",
    )


class ConsideredLabel(ApiModel):
    """A label the model weighed seriously but declined to assign."""

    label_id: str = Field(
        min_length=1,
        description="Id of the considered label, from the allowed vocabulary.",
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description=(
            "How sure the model is that the label applies — deliberately low, "
            "since it was not sure enough to assign it."
        ),
    )
    reason: str = Field(
        description="One short line on why the label was considered but not assigned.",
    )


class DocumentClassificationResponse(ApiModel):
    """Terminal classification result.

    ``assignments`` is the subset of the allowed vocabulary the model assigned
    to the document, as label **ids** with calibrated confidences: at most five
    entries, deduplicated, in the model's order. ``labels`` mirrors the ids in
    ``assignments`` (same order) and is kept for backward compatibility.
    ``considered`` lists labels the model weighed seriously but declined to
    assign; a label never appears in both lists. Empty lists are a valid answer
    — nothing in the vocabulary fit. This is a plain answer from a dedicated
    endpoint — it carries no ``outcome`` discriminator (it isn't one of the
    orchestrator's WorkflowOutcome-routed union responses).
    """

    labels: list[str] = Field(
        default_factory=list,
        description="Ids of the assigned labels — mirrors ``assignments``, in order.",
    )
    assignments: list[LabelAssignment] = Field(
        default_factory=list,
        description="Labels assigned to the document, each with a confidence.",
    )
    considered: list[ConsideredLabel] = Field(
        default_factory=list,
        description="Labels seriously weighed but not assigned.",
    )


# Only one response shape today; kept as a named alias so routes and agents have
# a stable response type to import.
ClassifyDocumentResponse = DocumentClassificationResponse
