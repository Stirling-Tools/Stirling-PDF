from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from functools import cache
from pathlib import Path

logger = logging.getLogger(__name__)

# Written by `npm run docs:sync` alongside the frontend copy, and shipped because both
# engine images COPY the whole engine/src tree. Named product_docs, not docs, to stay
# clear of stirling.documents (the per-user vector store) and of the root .dockerignore.
_PACKAGED = Path(__file__).with_name("docs_manifest.json")

# Dev and pytest run from a checkout where the packaged copy may not have been synced yet.
_REPO_FALLBACK = (
    Path(__file__).parents[4] / "frontend" / "editor" / "src" / "portal" / "generated" / "docsManifest.json"
)

_PATH_ENV = "STIRLING_PRODUCT_DOCS_PATH"

# How many pages one lookup may return. Stated in the selector prompt too - keep them in step.
MAX_PAGES = 3

# Below this, a long page's remaining slice is noise rather than an answer.
_MIN_USEFUL_SLICE = 500
_TRUNCATED = "\n\n[...page truncated...]"


@dataclass(frozen=True)
class DocPage:
    id: str
    title: str
    section: str
    description: str
    markdown: str

    def toc_row(self) -> str:
        """One selector-facing line. Description is omitted rather than faked when absent."""
        row = f"{self.id} | {self.section} | {self.title}"
        return f"{row} | {self.description}" if self.description else row


@dataclass(frozen=True)
class DocsManifest:
    pages: dict[str, DocPage]

    def __len__(self) -> int:
        return len(self.pages)

    def toc(self) -> str:
        """The whole catalogue as selector input. Measured at ~7.9k chars for 71 pages."""
        return "\n".join(page.toc_row() for page in self.pages.values())

    def resolve(self, ids: list[str]) -> list[DocPage]:
        """Map model-supplied ids to pages, in order, dropping anything it invented and
        any id it repeated - a duplicate would otherwise spend the body budget twice on
        the same page and crowd out the second-choice one."""
        found: list[DocPage] = []
        seen: set[str] = set()
        for doc_id in ids:
            if doc_id in seen:
                continue
            seen.add(doc_id)
            page = self.pages.get(doc_id)
            if page is None:
                logger.info("[product-docs] model named an unknown page id %r; dropped", doc_id)
                continue
            found.append(page)
        return found

    def render(self, ids: list[str], max_chars: int, max_pages: int = MAX_PAGES) -> str:
        """Selected pages, whole and unchunked, truncated only if the total blows the budget.

        Capping happens after resolve() has dropped unknown and repeated ids, so a model that
        names the same page twice spends one slot on it rather than two.
        """
        pages = self.resolve(ids)[:max_pages]
        if not pages:
            return ""
        sections: list[str] = []
        used = 0
        for page in pages:
            header = f"# {page.title}\n(documentation page: {page.id})\n\n"
            remaining = max_chars - used - len(header)
            if remaining <= 0:
                logger.info("[product-docs] body budget exhausted before %r", page.id)
                break
            # A few hundred leftover characters of a LONG page is noise the model reads past,
            # so stop rather than truncate that small. A page that fits whole always goes in.
            # The first page is included even truncated, or one oversized page returns nothing.
            if len(page.markdown) > remaining and sections and remaining < _MIN_USEFUL_SLICE:
                logger.info("[product-docs] remaining budget too small to be useful for %r", page.id)
                break
            body = page.markdown
            if len(body) > remaining:
                body = body[:remaining] + _TRUNCATED
            sections.append(header + body)
            used += len(header) + len(body)
        return "\n\n---\n\n".join(sections)


def _manifest_path() -> Path | None:
    override = os.environ.get(_PATH_ENV, "").strip()
    if override:
        return Path(override)
    if _PACKAGED.is_file():
        return _PACKAGED
    if _REPO_FALLBACK.is_file():
        return _REPO_FALLBACK
    return None


def _parse(raw: str) -> DocsManifest:
    data = json.loads(raw)
    pages: dict[str, DocPage] = {}
    for doc_id, entry in (data.get("docs") or {}).items():
        markdown = (entry.get("markdown") or "").strip()
        if not markdown:
            continue
        pages[doc_id] = DocPage(
            id=doc_id,
            title=entry.get("title") or doc_id,
            section=entry.get("section") or "",
            description=(entry.get("description") or "").strip(),
            markdown=markdown,
        )
    return DocsManifest(pages=pages)


@cache
def load_manifest() -> DocsManifest:
    """Read the committed manifest once per process. Missing or unreadable is not fatal:
    an empty manifest makes the docs tool withhold itself rather than take the engine down."""
    path = _manifest_path()
    if path is None:
        logger.warning("[product-docs] no manifest found; documentation answers are disabled")
        return DocsManifest(pages={})
    try:
        manifest = _parse(path.read_text(encoding="utf-8"))
    # Broad by design: a hand-edited or half-written manifest can be valid JSON of the wrong
    # shape, which raises AttributeError/TypeError rather than ValueError. None of it is worth
    # refusing to start the engine over.
    except (OSError, ValueError, AttributeError, TypeError) as exc:
        logger.warning("[product-docs] could not read %s (%s); documentation answers are disabled", path, exc)
        return DocsManifest(pages={})
    logger.info("[product-docs] loaded %d pages from %s", len(manifest), path)
    return manifest
