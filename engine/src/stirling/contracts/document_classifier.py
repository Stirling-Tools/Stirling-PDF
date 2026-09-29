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


class DocumentClassificationResponse(ApiModel):
    """Terminal classification result.

    ``labels`` is the subset of the allowed vocabulary the model assigned to the
    document, as label **ids**: at most five entries, deduplicated, in the
    model's order. An empty list is a valid answer — nothing in the vocabulary
    fit. This is a plain answer from a dedicated endpoint — it carries no
    ``outcome`` discriminator (it isn't one of the orchestrator's
    WorkflowOutcome-routed union responses).
    """

    labels: list[str] = Field(default_factory=list)


# Only one response shape today; kept as a named alias so routes and agents have
# a stable response type to import.
ClassifyDocumentResponse = DocumentClassificationResponse
