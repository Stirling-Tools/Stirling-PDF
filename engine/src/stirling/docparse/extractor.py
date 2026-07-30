"""Schema-driven field extraction with grounded citations and confidence.

The caller supplies a JSON Schema (subset: scalar types, enums, arrays of
scalars, nested objects). We build a dynamic pydantic output model where every
leaf answers ``{value, quote, confidence}``, run one smart-model pass, then
ground each quote against the page text in code. Model confidence is damped
when a quote can't be found - the model asserts, the grounding decides how
much to believe it.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from pydantic import BaseModel, Field, JsonValue, create_model
from pydantic_ai import Agent

from stirling.agents.output_mode import output_retries, structured_output
from stirling.contracts.docparse import (
    DocparseTier,
    ExtractedField,
    ExtractFieldsRequest,
    ExtractFieldsResponse,
    FieldCitation,
    ParseDocumentResponse,
)
from stirling.contracts.documents import PageText
from stirling.models import ApiModel
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)

# Confidence multiplier when the supporting quote can't be found in the document.
UNGROUNDED_PENALTY = 0.6
# Floor when the model omitted quote/confidence but the value itself is found
# verbatim in the document - the grounding is real even if the model was terse.
VALUE_GROUNDED_FLOOR = 0.5
MAX_SCHEMA_DEPTH = 3
MAX_FIELDS = 100

_SYSTEM_PROMPT = (
    "You extract structured fields from a document.\n"
    "\n"
    "Rules:\n"
    "- For every field, return the value exactly as the schema types it, a short VERBATIM quote "
    "from the document that supports it, and your confidence from 0.0 to 1.0.\n"
    "- The quote must be copied character-for-character from the document text, at most 200 characters.\n"
    "- If the document does not contain the field, return value null, quote null, confidence 0.0. "
    "Never guess or fabricate.\n"
    "- Dates: return them formatted as the schema/description asks; quote the original text.\n"
    "- The document may be in any language."
)


class SchemaError(ValueError):
    """The supplied JSON Schema is outside the supported subset."""


def _scalar_type(spec: dict[str, Any]) -> Any:
    # Enums stay str-typed; the allowed values travel in the field description
    # (dynamic Literal types don't typecheck and local models handle them badly).
    match spec.get("type"):
        case "string":
            return str
        case "integer":
            return int
        case "number":
            return float
        case "boolean":
            return bool
        case _:
            raise SchemaError(f"Unsupported schema type: {spec.get('type')!r}")


def _describe(spec: dict[str, Any]) -> str | None:
    description = spec.get("description") if isinstance(spec.get("description"), str) else None
    enum = spec.get("enum")
    if isinstance(enum, list) and enum:
        allowed = ", ".join(str(v) for v in enum)
        description = f"{description + ' ' if description else ''}Allowed values: {allowed}."
    return description


def _leaf_answer_model(name: str, value_type: Any, description: str | None) -> type[BaseModel]:
    return create_model(
        f"Answer_{re.sub(r'[^A-Za-z0-9]', '_', name)}",
        __base__=ApiModel,
        value=(value_type | None, Field(default=None, description=description or None)),
        quote=(str | None, Field(default=None, max_length=400)),
        confidence=(float, Field(default=0.0, ge=0.0, le=1.0)),
    )


def build_output_model(
    fields_schema: dict[str, Any], *, _depth: int = 0, _name: str = "ExtractionOutput"
) -> type[BaseModel]:
    """Turn the caller's JSON Schema into a pydantic model of leaf answers."""
    if _depth > MAX_SCHEMA_DEPTH:
        raise SchemaError(f"Schema nesting deeper than {MAX_SCHEMA_DEPTH} is not supported")
    properties = fields_schema.get("properties")
    if not isinstance(properties, dict) or not properties:
        raise SchemaError("Schema must be an object with a non-empty 'properties' map")
    if len(properties) > MAX_FIELDS:
        raise SchemaError(f"Schema has more than {MAX_FIELDS} fields")

    model_fields: dict[str, Any] = {}
    for raw_name, spec in properties.items():
        name = str(raw_name)
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
            raise SchemaError(f"Field name {name!r} must be a valid identifier")
        if not isinstance(spec, dict):
            raise SchemaError(f"Field {name!r} must map to a schema object")
        description = _describe(spec)

        if spec.get("type") == "object":
            nested = build_output_model(spec, _depth=_depth + 1, _name=f"{_name}_{name}")
            model_fields[name] = (nested, Field(...))
        elif spec.get("type") == "array":
            items = spec.get("items")
            if not isinstance(items, dict):
                raise SchemaError(f"Array field {name!r} needs an 'items' schema")
            if items.get("type") == "object":
                raise SchemaError(f"Array field {name!r}: arrays of objects are not supported yet")
            item_type: Any = _scalar_type(items)
            answer = _leaf_answer_model(name, list[item_type], description)
            model_fields[name] = (answer, Field(...))
        else:
            answer = _leaf_answer_model(name, _scalar_type(spec), description)
            model_fields[name] = (answer, Field(...))

    return create_model(_name, __base__=ApiModel, **model_fields)


_WHITESPACE = re.compile(r"\s+")


def _normalize(text: str) -> str:
    return _WHITESPACE.sub(" ", text).strip().casefold()


def find_quote(quote: str, pages: list[PageText]) -> tuple[int, int, int] | None:
    """Locate ``quote`` in the page texts, whitespace-insensitively.

    Returns (page_number, start_offset, end_offset) into the page's raw text,
    or None. Offsets are approximate under whitespace collapsing: we search the
    normalized page, then map back by counting non-space characters.
    """
    needle = _normalize(quote)
    if not needle:
        return None
    for page in pages:
        haystack = _normalize(page.text)
        idx = haystack.find(needle)
        if idx < 0:
            continue
        start = _denormalize_offset(page.text, idx)
        end = _denormalize_offset(page.text, idx + len(needle))
        return page.page_number, start, min(end, len(page.text))
    return None


def _denormalize_offset(raw: str, normalized_offset: int) -> int:
    """Map an offset in the normalized string back into the raw string."""
    count = 0
    in_space = True  # leading whitespace is stripped by _normalize
    for i, ch in enumerate(raw):
        if ch.isspace():
            if in_space:
                continue
            in_space = True
        else:
            in_space = False
        if count >= normalized_offset:
            return i
        count += 1
    return len(raw)


def _bbox_for_quote(quote: str, parse: ParseDocumentResponse | None) -> list[float] | None:
    if parse is None:
        return None
    needle = _normalize(quote)
    if not needle:
        return None
    for block in parse.blocks:
        if block.bbox is not None and needle in _normalize(block.text):
            return block.bbox
    return None


def flatten_answers(output: BaseModel, prefix: str = "") -> list[tuple[str, JsonValue, str | None, float]]:
    """Walk the dynamic output model into (dotted_name, value, quote, confidence) leaves."""
    leaves: list[tuple[str, JsonValue, str | None, float]] = []
    for name in type(output).model_fields:
        node = getattr(output, name)
        dotted = f"{prefix}{name}"
        if isinstance(node, BaseModel) and "confidence" in type(node).model_fields:
            value = getattr(node, "value", None)
            quote = getattr(node, "quote", None)
            confidence = float(getattr(node, "confidence", 0.0) or 0.0)
            leaves.append((dotted, value, quote, confidence))
        elif isinstance(node, BaseModel):
            leaves.extend(flatten_answers(node, prefix=f"{dotted}."))
    return leaves


def _format_pages(pages: list[PageText], max_characters: int) -> str:
    parts: list[str] = []
    used = 0
    for page in pages:
        snippet = page.text[: max(0, max_characters - used)]
        parts.append(f"[Page {page.page_number}]\n{snippet}")
        used += len(snippet)
        if used >= max_characters:
            break
    return "\n\n".join(parts) if parts else "(no extractable text)"


def pages_from_parse(parse: ParseDocumentResponse) -> list[PageText]:
    """Rebuild per-page text from parse blocks (advanced path with no caller text)."""
    by_page: dict[int, list[str]] = {}
    for block in parse.blocks:
        by_page.setdefault(block.page, []).append(block.text)
    return [PageText(page_number=n, text="\n".join(t)) for n, t in sorted(by_page.items())]


class ExtractFieldsAgent:
    """One smart-model pass over the document, then code-side grounding."""

    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime

    async def extract(
        self,
        request: ExtractFieldsRequest,
        pages: list[PageText],
        parse: ParseDocumentResponse | None,
    ) -> ExtractFieldsResponse:
        output_model = build_output_model(dict(request.fields_schema))
        provider = self.runtime.settings.chat_provider
        agent: Agent[None, BaseModel] = Agent(
            model=self.runtime.smart_model,
            output_type=structured_output([output_model], chat_provider=provider),
            system_prompt=_SYSTEM_PROMPT,
            model_settings=self.runtime.smart_model_settings,
            retries=output_retries(provider),
        )
        prompt = self._build_prompt(request, pages)
        result = await agent.run(prompt)
        fields = self._ground(result.output, pages, parse)
        overall = round(min((f.confidence for f in fields), default=0.0), 4)
        tier = DocparseTier.ADVANCED if parse is not None else DocparseTier.BASIC
        return ExtractFieldsResponse(mode=tier, fields=fields, overall_confidence=overall)

    def _build_prompt(self, request: ExtractFieldsRequest, pages: list[PageText]) -> str:
        instructions = f"Additional instructions: {request.instructions}\n\n" if request.instructions else ""
        return (
            f"{instructions}"
            f"Document file name: {request.file_name}\n"
            f"Document content:\n{_format_pages(pages, self.runtime.settings.max_characters)}"
        )

    @staticmethod
    def _ground(
        output: BaseModel,
        pages: list[PageText],
        parse: ParseDocumentResponse | None,
    ) -> list[ExtractedField]:
        fields: list[ExtractedField] = []
        for name, value, quote, model_confidence in flatten_answers(output):
            citations: list[FieldCitation] = []
            confidence = max(0.0, min(1.0, model_confidence))
            if value is None:
                confidence = 0.0
            elif quote:
                located = find_quote(quote, pages)
                if located is not None:
                    page_number, start, end = located
                    citations.append(
                        FieldCitation(
                            page=page_number,
                            bbox=_bbox_for_quote(quote, parse),
                            quote=quote,
                            start_offset=start,
                            end_offset=end,
                        )
                    )
                else:
                    citations.append(FieldCitation(page=None, bbox=None, quote=quote))
                    confidence *= UNGROUNDED_PENALTY
            else:
                # Terse models (local Ollama especially) often skip the quote;
                # grounding the value itself keeps citations and a usable score.
                value_text = _render_value(value)
                located = find_quote(value_text, pages) if value_text else None
                if located is not None:
                    page_number, start, end = located
                    citations.append(
                        FieldCitation(
                            page=page_number,
                            bbox=_bbox_for_quote(value_text, parse),
                            quote=value_text,
                            start_offset=start,
                            end_offset=end,
                        )
                    )
                    confidence = max(confidence, VALUE_GROUNDED_FLOOR)
                else:
                    confidence *= UNGROUNDED_PENALTY
            fields.append(ExtractedField(name=name, value=value, confidence=round(confidence, 4), citations=citations))
        return fields


def _render_value(value: JsonValue) -> str:
    """A searchable text form of a leaf value; empty when nothing sensible exists."""
    if value is None or isinstance(value, (dict, list)) or isinstance(value, bool):
        return ""
    return str(value)
