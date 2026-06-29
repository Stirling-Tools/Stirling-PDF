from __future__ import annotations

from typing import Literal

from pydantic import Field

from stirling.models import ApiModel

from .common import WorkflowOutcome
from .documents import PageText


class DocumentType(ApiModel):
    """A specific instrument within a category (e.g. ``nda`` inside ``contract``)."""

    id: str = Field(min_length=1)
    label: str = Field(min_length=1)


class DocumentCategory(ApiModel):
    """A structural family of documents, owning the doc_types shaped like it."""

    id: str = Field(min_length=1)
    label: str = Field(min_length=1)
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

    ``category`` and ``doc_type`` are ids drawn from the taxonomy, or the
    sentinel ``"unknown"`` when the model's answer fell outside it. ``tags`` are
    the subset of the model's tags that exist in the taxonomy.
    """

    outcome: Literal[WorkflowOutcome.CLASSIFICATION] = WorkflowOutcome.CLASSIFICATION
    category: str
    doc_type: str
    type_confidence: float = Field(ge=0.0, le=1.0)
    tags: list[str] = Field(default_factory=list)


# Only one response shape today; kept as a named alias so routes and agents have
# a stable response type to import.
ClassifyDocumentResponse = DocumentClassificationResponse
