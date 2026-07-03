from __future__ import annotations

from pydantic import Field

from stirling.models import ApiModel

from .documents import PageText


class DocumentType(ApiModel):
    """A specific instrument within a category (e.g. ``nda`` inside ``contract``)."""

    id: str = Field(min_length=1)
    label: str = Field(min_length=1)


class DocumentCategory(ApiModel):
    """A structural family of documents, owning the doc_types shaped like it."""

    id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    # Presentational only (a UI icon key); accepted so the supplied taxonomy
    # round-trips, but the classifier never reads it.
    icon: str | None = None
    doc_types: list[DocumentType] = Field(default_factory=list)


class ClassificationTaxonomy(ApiModel):
    """The vocabulary a document is classified against.

    Supplied per request by the backend. When omitted, the engine falls back to
    its small built-in default (see ``DEFAULT_TAXONOMY``). Tags are free-standing
    descriptors that never own doc_types.
    """

    categories: list[DocumentCategory] = Field(min_length=1)
    tags: list[str] = Field(default_factory=list)


class ClassifyDocumentRequest(ApiModel):
    """Classify one document from its page text.

    The caller sends the page text directly — typically just the bounded window
    (first/last pages), since the classifier reads no more than that. There is no
    ingestion or RAG step.
    """

    file_name: str = Field(min_length=1)
    pages: list[PageText] = Field(default_factory=list)
    taxonomy: ClassificationTaxonomy | None = None


class DocumentClassificationResponse(ApiModel):
    """Terminal classification result.

    ``category`` and ``doc_type`` are ids drawn from the taxonomy (the internal
    matching keys), or the sentinel ``"unknown"`` when the model's answer fell
    outside it. ``category_label`` and ``doc_type_label`` are the human-readable
    labels for those ids (what the UI shows); Python derives them from the
    matched taxonomy entry so the two never drift. ``tags`` are the subset of the
    model's tags that exist in the taxonomy. This is a plain answer from a
    dedicated endpoint — it carries no ``outcome`` discriminator (it isn't one of
    the orchestrator's WorkflowOutcome-routed union responses).
    """

    category: str
    category_label: str
    doc_type: str
    doc_type_label: str
    type_confidence: float = Field(ge=0.0, le=1.0)
    tags: list[str] = Field(default_factory=list)


# Only one response shape today; kept as a named alias so routes and agents have
# a stable response type to import.
ClassifyDocumentResponse = DocumentClassificationResponse
