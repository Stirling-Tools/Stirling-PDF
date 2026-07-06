from __future__ import annotations

from pydantic import Field

from stirling.models import ApiModel

from .documents import PageText


class ClassifyDocumentRequest(ApiModel):
    """Classify one document from its page text.

    The caller sends the page text directly — typically just the bounded window
    (first/last pages), since the classifier reads no more than that. There is no
    ingestion or RAG step.

    ``labels`` is the allowed label-name vocabulary for this request (the caller
    merges team and user labels before sending). When omitted — or sent as an
    empty list — the engine falls back to its built-in default vocabulary (see
    ``DEFAULT_LABELS``).
    """

    file_name: str = Field(min_length=1)
    pages: list[PageText] = Field(default_factory=list)
    labels: list[str] | None = None


class DocumentClassificationResponse(ApiModel):
    """Terminal classification result.

    ``labels`` is the subset of the allowed vocabulary the model assigned to the
    document: at most five entries, deduplicated, in the vocabulary's canonical
    casing. An empty list is a valid answer — nothing in the vocabulary fit.
    This is a plain answer from a dedicated endpoint — it carries no ``outcome``
    discriminator (it isn't one of the orchestrator's WorkflowOutcome-routed
    union responses).
    """

    labels: list[str] = Field(default_factory=list)


# Only one response shape today; kept as a named alias so routes and agents have
# a stable response type to import.
ClassifyDocumentResponse = DocumentClassificationResponse
