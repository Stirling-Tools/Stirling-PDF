"""Schema suggestion: the fast model proposes extractable fields for a document.

Reads a bounded window of the first pages (the fields worth extracting from a
document type are evident from its opening) and answers with candidate fields,
which are then validated in code: names coerced to snake_case, duplicates and
unsupported types dropped, capped at the caller's maxFields."""

from __future__ import annotations

import logging
import re

from pydantic import Field
from pydantic_ai import Agent

from stirling.agents.output_mode import output_retries, structured_output
from stirling.contracts.docparse import (
    DocparseTier,
    SuggestedField,
    SuggestedFieldType,
    SuggestSchemaRequest,
    SuggestSchemaResponse,
)
from stirling.contracts.documents import PageText
from stirling.models import ApiModel
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)

# First pages read; a fixed window keeps cost flat regardless of length.
WINDOW_PAGES = 3
# Per-page preview budget; field candidates show up near page openings.
PAGE_PREVIEW_CHARS = 2_000

_SYSTEM_PROMPT = (
    "You design an extraction schema for a document type.\n"
    "\n"
    "You are shown the first pages of a document. Propose the most useful fields "
    "a user would want extracted from documents of this type.\n"
    "Rules:\n"
    "- Name each field as a snake_case identifier (e.g. 'invoice_number').\n"
    "- Type each field as one of: string, number, integer, boolean.\n"
    "- Give each field a one-sentence description of what it holds.\n"
    "- Propose fields for the document TYPE, not only values visible on these pages.\n"
    "- Order fields from most to least useful."
)


class _SuggestedField(ApiModel):
    # Loosely typed on purpose: bad names/types are dropped in code, not retried.
    name: str = Field(description="snake_case identifier for the field.")
    type: str = Field(description="One of: string, number, integer, boolean.")
    description: str = ""


class _SuggestOutput(ApiModel):
    fields: list[_SuggestedField] = Field(default_factory=list)


_IDENTIFIER = re.compile(r"[a-z][a-z0-9_]*")
_CAMEL_BOUNDARY = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")
_NON_ALNUM = re.compile(r"[^A-Za-z0-9]+")
_VALID_TYPES = {t.value for t in SuggestedFieldType}


def to_snake_case(name: str) -> str:
    """Coerce a model-proposed name into snake_case ('Invoice No.' -> 'invoice_no')."""
    return _NON_ALNUM.sub("_", _CAMEL_BOUNDARY.sub("_", name.strip())).strip("_").lower()


def validate_fields(output: _SuggestOutput, max_fields: int) -> list[SuggestedField]:
    """Keep unique snake_case names with supported types, capped at ``max_fields``."""
    kept: list[SuggestedField] = []
    seen: set[str] = set()
    for field in output.fields:
        name = to_snake_case(field.name)
        type_name = field.type.strip().lower()
        if not _IDENTIFIER.fullmatch(name) or name in seen or type_name not in _VALID_TYPES:
            continue
        seen.add(name)
        kept.append(
            SuggestedField(name=name, type=SuggestedFieldType(type_name), description=field.description.strip())
        )
        if len(kept) == max_fields:
            break
    return kept


def _format_pages(pages: list[PageText]) -> str:
    shown = pages[:WINDOW_PAGES]
    parts = [f"[Page {p.page_number}] {p.text[:PAGE_PREVIEW_CHARS]}" for p in shown]
    if len(pages) > WINDOW_PAGES:
        parts.append(f"({len(pages) - WINDOW_PAGES} further pages omitted)")
    return "\n\n".join(parts) if parts else "(no extractable text)"


class SuggestSchemaAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        provider = runtime.settings.chat_provider
        self._agent: Agent[None, _SuggestOutput] = Agent(
            model=runtime.fast_model,
            output_type=structured_output([_SuggestOutput], chat_provider=provider),
            system_prompt=_SYSTEM_PROMPT,
            model_settings=runtime.fast_model_settings,
            retries=output_retries(provider),
        )

    async def suggest(
        self, request: SuggestSchemaRequest, pages: list[PageText], tier: DocparseTier
    ) -> SuggestSchemaResponse:
        prompt = (
            f"Propose up to {request.max_fields} fields.\n\n"
            f"Document file name: {request.file_name}\n"
            f"Document content (first pages):\n{_format_pages(pages)}"
        )
        result = await self._agent.run(prompt)
        fields = validate_fields(result.output, request.max_fields)
        logger.info("docparse: suggested %d fields for %s", len(fields), request.file_name)
        return SuggestSchemaResponse(mode=tier, fields=fields)
