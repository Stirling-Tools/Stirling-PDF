from __future__ import annotations

import json
import logging
from pathlib import Path

from pydantic import Field
from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.contracts import (
    ClassificationTaxonomy,
    ClassifyDocumentRequest,
    ClassifyDocumentResponse,
    DocumentClassificationResponse,
    PageText,
)
from stirling.models import ApiModel
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)

# Sentinel id for an answer that fell outside the supplied vocabulary.
UNKNOWN_LABEL = "unknown"
# Human-readable label shown for the off-list sentinel.
UNKNOWN_DISPLAY_LABEL = "Unknown"
# An off-list answer can never be reported as more confident than this, so a
# confident-but-wrong model answer can't clear an organisation's accept
# threshold downstream. See the design doc's "Validate" step.
UNKNOWN_MAX_CONFIDENCE = 0.2
# Pages read from each end of the document. A document's type is evident from
# its opening (and closing) pages, so a fixed window keeps cost and latency flat
# regardless of length. Promote to AppSettings if it ever needs tuning.
WINDOW_PAGES = 2

# The built-in vocabulary the classifier falls back to when a request doesn't
# supply its own. GENERATED from the TS source of truth
# (frontend/editor/src/proprietary/data/classificationTaxonomy.ts) via
# `task frontend:classifier-categories` — edit that file, not this JSON. Validated into the
# typed contract on import, so a malformed entry fails fast.
_DEFAULT_TAXONOMY_PATH = Path(__file__).with_name("default_classification_taxonomy.generated.json")
# The file carries an underscore-prefixed "_generated" notice (JSON has no
# comments); drop meta keys before validating against the strict contract.
_raw_taxonomy = json.loads(_DEFAULT_TAXONOMY_PATH.read_text(encoding="utf-8"))
DEFAULT_TAXONOMY = ClassificationTaxonomy.model_validate(
    {key: value for key, value in _raw_taxonomy.items() if not key.startswith("_")}
)


_SYSTEM_PROMPT = (
    "You identify what a document is, choosing only from a fixed vocabulary you "
    "are given. Decide along three axes:\n"
    "- category: the document's structural family. Choose EXACTLY ONE category id.\n"
    "- doc_type: the specific instrument within that family. Choose EXACTLY ONE "
    "doc_type id listed under the category you chose.\n"
    "- tags: zero or more descriptor ids from the tag list.\n"
    "\n"
    "Rules:\n"
    "- Use only ids from the supplied vocabulary. If nothing fits, return "
    f'"{UNKNOWN_LABEL}" for category and/or doc_type.\n'
    "- The doc_type you pick must belong to the category you pick.\n"
    "- type_confidence (0.0-1.0) is how sure you are that doc_type is correct.\n"
    "- Judge from the document's content and structure, not from keywords alone. "
    "The document may be in any language.\n"
    "- You are shown only the first and last pages; that is enough to identify the type."
)


class _ClassifierOutput(ApiModel):
    """Raw model answer, before it is validated against the taxonomy."""

    category: str = Field(description="A category id from the vocabulary, or 'unknown'.")
    doc_type: str = Field(description="A doc_type id belonging to the chosen category, or 'unknown'.")
    type_confidence: float = Field(ge=0.0, le=1.0, description="Confidence that doc_type is correct.")
    tags: list[str] = Field(default_factory=list, description="Descriptor ids drawn from the tag list.")


def render_taxonomy(taxonomy: ClassificationTaxonomy) -> str:
    """Render the vocabulary for the prompt, ids first so the model echoes them."""
    lines = ["Categories (id (label): doc_types as id (label)):"]
    for category in taxonomy.categories:
        types = ", ".join(f"{doc_type.id} ({doc_type.label})" for doc_type in category.doc_types) or "(none)"
        lines.append(f"- {category.id} ({category.label}): {types}")
    lines.append(f"Tags: {', '.join(taxonomy.tags) or '(none)'}")
    return "\n".join(lines)


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


def validate_against_taxonomy(
    output: _ClassifierOutput,
    taxonomy: ClassificationTaxonomy,
) -> DocumentClassificationResponse:
    """Coerce a raw model answer onto the supplied vocabulary.

    An off-list category collapses both axes to ``unknown``; a doc_type that
    isn't a child of its (valid) category collapses the type alone. Either
    collapse caps confidence. Tags are filtered to the known set, de-duplicated,
    and returned in the model's order. The model identifies; these rules decide
    what is allowed to stand.
    """
    categories_by_id = {category.id.lower(): category for category in taxonomy.categories}
    allowed_tags = {tag.lower(): tag for tag in taxonomy.tags}

    kept_tags: list[str] = []
    for tag in output.tags:
        canonical = allowed_tags.get(tag.strip().lower())
        if canonical is not None and canonical not in kept_tags:
            kept_tags.append(canonical)

    category = categories_by_id.get(output.category.strip().lower())
    if category is None:
        return DocumentClassificationResponse(
            category=UNKNOWN_LABEL,
            category_label=UNKNOWN_DISPLAY_LABEL,
            doc_type=UNKNOWN_LABEL,
            doc_type_label=UNKNOWN_DISPLAY_LABEL,
            type_confidence=min(output.type_confidence, UNKNOWN_MAX_CONFIDENCE),
            tags=kept_tags,
        )

    types_by_id = {doc_type.id.lower(): doc_type for doc_type in category.doc_types}
    doc_type = types_by_id.get(output.doc_type.strip().lower())
    if doc_type is None:
        return DocumentClassificationResponse(
            category=category.id,
            category_label=category.label,
            doc_type=UNKNOWN_LABEL,
            doc_type_label=UNKNOWN_DISPLAY_LABEL,
            type_confidence=min(output.type_confidence, UNKNOWN_MAX_CONFIDENCE),
            tags=kept_tags,
        )

    return DocumentClassificationResponse(
        category=category.id,
        category_label=category.label,
        doc_type=doc_type.id,
        doc_type_label=doc_type.label,
        type_confidence=output.type_confidence,
        tags=kept_tags,
    )


class DocumentClassifierAgent:
    """Identifies a document's category, type, and tags against a taxonomy.

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
        # Override point: a request-supplied taxonomy (e.g. a future per-org / DB
        # vocabulary the backend resolves) wins; the generated default is the fallback.
        taxonomy = request.taxonomy or DEFAULT_TAXONOMY
        window = select_window(request.pages)
        prompt = self._build_prompt(request.file_name, taxonomy, window)
        logger.debug("[classify] prompt:\n%s", prompt)
        result = await self._agent.run(prompt)
        return validate_against_taxonomy(result.output, taxonomy)

    @staticmethod
    def _build_prompt(file_name: str, taxonomy: ClassificationTaxonomy, window: list[PageText]) -> str:
        return (
            f"{render_taxonomy(taxonomy)}\n\n"
            f"Document file name: {file_name}\n"
            f"Document content (first and last pages):\n{format_window(window)}"
        )
