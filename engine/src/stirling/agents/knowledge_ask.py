"""Grounded Q&A over the caller's stored documents.

Retrieval runs the same cross-collection search as ``POST /documents/search``;
one smart-model pass then answers only from the retrieved passages, citing
document and page inline. No retrieval hit means a plain "not found" answer.
"""

from __future__ import annotations

import logging

from pydantic import Field
from pydantic_ai import Agent

from stirling.agents.output_mode import output_retries, structured_output
from stirling.contracts import AskDocumentsRequest, AskDocumentsResponse, DocumentPassage
from stirling.documents import CollectionSearchHit
from stirling.documents.service import PAGE_NUMBER_METADATA_KEY
from stirling.models import ApiModel, PrincipalId
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)

# Metadata keys written by docparse rag-ingest (_chunk_metadata) for structure-aware chunks.
_PAGE_START_KEY = "page_start"
_PAGE_END_KEY = "page_end"
_HEADING_PATH_KEY = "heading_path"
_HEADING_PATH_SEPARATOR = " > "

_SYSTEM_PROMPT = (
    "You answer questions using ONLY the numbered passages you are given.\n"
    "\n"
    "Rules:\n"
    "- Every statement must come from the passages. Never use outside knowledge, never guess.\n"
    "- Cite the document and page inline right after each fact, "
    'e.g. "(invoice.pdf p.2)" or "(report.pdf p.4-6)", using the names and pages '
    "shown in each passage header.\n"
    "- If the passages do not answer the question, say plainly that the stored "
    "documents do not cover it. Do not attempt a partial guess.\n"
    "- Answer in the same language as the question."
)

_NO_PASSAGES_ANSWER = "I couldn't find anything relevant to that question in your stored documents."


class _AskOutput(ApiModel):
    """Raw model answer for the single ask pass."""

    answer: str = Field(description="The answer grounded in the passages, with inline citations.")


def _meta_int(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def passage_from_hit(hit: CollectionSearchHit) -> DocumentPassage:
    """Map a store search hit onto the wire passage shape.

    Docparse chunks carry page bounds and a heading path; plain page-text
    chunks only carry ``page_number``, which maps to both bounds.
    """
    meta = hit.result.document.metadata
    page_start = _meta_int(meta.get(_PAGE_START_KEY))
    page_end = _meta_int(meta.get(_PAGE_END_KEY))
    if page_start is None and page_end is None:
        page_start = page_end = _meta_int(meta.get(PAGE_NUMBER_METADATA_KEY))
    heading = meta.get(_HEADING_PATH_KEY)
    source = meta.get("source")
    if source and ":page:" in source:
        # Page-text chunk sources look like "report.pdf:page:3"; show the file name.
        source = source.rsplit(":page:", 1)[0]
    return DocumentPassage(
        document_id=hit.collection,
        text=hit.result.document.text,
        score=hit.result.score,
        page_start=page_start,
        page_end=page_end,
        heading_path=heading.split(_HEADING_PATH_SEPARATOR) if heading else [],
        source=source or None,
    )


def format_passages(passages: list[DocumentPassage]) -> str:
    """Render passages for the prompt with the citation handle in each header."""
    return "\n\n".join(_format_passage(i, passage) for i, passage in enumerate(passages, 1))


def _format_passage(index: int, passage: DocumentPassage) -> str:
    name = passage.source or passage.document_id
    if passage.page_start is None:
        pages = ""
    elif passage.page_end is not None and passage.page_end != passage.page_start:
        pages = f" p.{passage.page_start}-{passage.page_end}"
    else:
        pages = f" p.{passage.page_start}"
    return f"[Passage {index} | {name}{pages}]\n{passage.text}"


class KnowledgeAskAgent:
    """Answers a question from the caller's stored documents.

    Retrieves the top passages the caller can read (same path as the search
    endpoint), then runs one smart-model pass over just those passages.
    """

    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        # Ollama/custom block tool-calling under native json-schema output; see agents.output_mode.
        provider = runtime.settings.chat_provider
        self._agent: Agent[None, _AskOutput] = Agent(
            model=runtime.smart_model,
            output_type=structured_output([_AskOutput], chat_provider=provider),
            system_prompt=_SYSTEM_PROMPT,
            model_settings=runtime.smart_model_settings,
            retries=output_retries(provider),
        )

    async def ask(self, request: AskDocumentsRequest, principals: list[PrincipalId]) -> AskDocumentsResponse:
        hits = await self.runtime.documents.search_with_collections(
            request.question, principals=principals, top_k=request.top_k
        )
        passages = [passage_from_hit(hit) for hit in hits]
        if not passages:
            logger.info("[knowledge-ask] question=%r -> 0 passages", request.question)
            return AskDocumentsResponse(answer=_NO_PASSAGES_ANSWER, passages=[])
        prompt = f"Question: {request.question}\n\nPassages:\n{format_passages(passages)}"
        logger.debug("[knowledge-ask] prompt:\n%s", prompt)
        result = await self._agent.run(prompt)
        return AskDocumentsResponse(answer=result.output.answer, passages=passages)
