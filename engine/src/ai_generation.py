from __future__ import annotations

import json
import logging
from typing import Any

import models
from config import SMART_MODEL, STREAMING_ENABLED
from format_prompts import get_format_prompt
from html_utils import inject_theme
from llm_utils import run_ai, stream_ai
from prompts import (
    field_values_system_prompt,
    html_context_messages,
    html_edit_system_prompt,
    html_system_prompt,
    outline_generator_system_prompt,
    section_draft_system_prompt,
    template_fill_html_system_prompt,
)

logger = logging.getLogger(__name__)


def generate_outline_with_llm(
    prompt: str,
    document_type: str,
    constraints: models.Constraint | None = None,
) -> models.OutlineResponse:
    """
    Generate outline for a specific document type.

    document_type should already be detected - this function only generates the outline.
    """
    constraint_text = ""
    if constraints:
        tone = constraints.tone
        audience = constraints.audience
        pages = constraints.page_count
        constraint_text = f"Tone: {tone}. Audience: {audience}. Target pages: {pages}."

    # Try to get a format-specific extraction prompt
    format_prompt, default_sections = get_format_prompt(document_type)
    system_prompt = outline_generator_system_prompt(document_type, constraint_text, format_prompt, default_sections)

    messages: list[models.ChatMessage] = [
        models.ChatMessage(role="system", content=system_prompt),
        models.ChatMessage(role="user", content=prompt),
    ]

    parsed = run_ai(
        SMART_MODEL,
        messages,
        models.OutlineResponse,
        tag="outline",
    )

    if parsed:
        logger.info(
            "[OUTLINE] Generated outline doc_type=%s sections=%d filename=%s",
            parsed.doc_type,
            len(parsed.sections),
            parsed.outline_filename,
        )
        return parsed

    raise RuntimeError("AI outline generation failed.")


def generate_field_values(
    prompt: str,
    document_type: str,
    fields: list[dict[str, Any]],
    constraints: models.Constraint | None = None,
) -> list[dict[str, str]]:
    constraint_text = ""
    if constraints:
        tone = constraints.tone
        audience = constraints.audience
        pages = constraints.page_count
        constraint_text = f"Tone: {tone}. Audience: {audience}. Target pages: {pages}."
    system_prompt = field_values_system_prompt(constraint_text)
    messages: list[models.ChatMessage] = [
        models.ChatMessage(role="system", content=system_prompt),
        models.ChatMessage(role="user", content=f"Document type: {document_type}"),
        models.ChatMessage(role="user", content=f"Prompt:\n{prompt}"),
        models.ChatMessage(role="user", content=f"Fields:\n{json.dumps(fields, ensure_ascii=True)}"),
    ]
    parsed = run_ai(
        SMART_MODEL,
        messages,
        models.LLMFieldValuesResponse,
        tag="field_values",
    )
    if parsed:
        return [{"label": item.label, "value": item.value} for item in parsed.fields]

    raise RuntimeError("AI field extraction failed.")


def generate_section_draft(
    prompt: str,
    document_type: str,
    outline_text: str,
    constraints: models.Constraint | None = None,
) -> list[models.DraftSection]:
    constraint_text = ""
    if constraints:
        tone = constraints.tone
        audience = constraints.audience
        pages = constraints.page_count
        constraint_text = f"Tone: {tone}. Audience: {audience}. Target pages: {pages}."
    system_prompt = section_draft_system_prompt(constraint_text)
    messages: list[models.ChatMessage] = [
        models.ChatMessage(role="system", content=system_prompt),
        models.ChatMessage(role="user", content=f"Document type: {document_type}"),
        models.ChatMessage(role="user", content=f"Outline:\n{outline_text}"),
        models.ChatMessage(role="user", content=f"Prompt:\n{prompt}"),
    ]
    parsed = run_ai(
        SMART_MODEL,
        messages,
        models.LLMDraftSectionsResponse,
        tag="section_draft",
    )
    return parsed.sections


# ── HTML generation ───────────────────────────────────────────────────────────


def generate_template_fill_html_stream(
    template_html: str,
    document_type: str,
    outline_text: str,
    draft_sections: list[models.DraftSection] | None = None,
    constraints: models.Constraint | None = None,
    theme: dict[str, str] | None = None,
    additional_instructions: str | None = None,
    has_logo: bool = False,
):
    """Fill an HTML template by replacing {{PLACEHOLDER}} tokens, streaming chunks."""
    constraints_text = ""
    if constraints:
        tone = constraints.tone
        audience = constraints.audience
        pages = constraints.page_count
        constraints_text = f"Tone: {tone}. Audience: {audience}. Target pages: {pages}."
    if draft_sections:
        constraints_text += "\nUse the section content to inform placeholder values."

    # Inject theme before sending to AI if overrides are provided
    if theme:
        template_html = inject_theme(template_html, theme)

    system_prompt = template_fill_html_system_prompt(constraints_text)
    messages: list[models.ChatMessage] = [
        models.ChatMessage(role="system", content=system_prompt),
        models.ChatMessage(role="user", content=f"Document type: {document_type}"),
        models.ChatMessage(
            role="user",
            content=(
                "CRITICAL EXAMPLE — What to preserve vs. what to change:\n"
                "If template has:\n"
                "  <div class='vendor-name'>{{VENDOR_NAME}}</div>\n"
                "You MUST output:\n"
                "  <div class='vendor-name'>Acme Corporation</div>  ← fill the token, keep the tag\n"
                "\n"
                "For multi-row content like {{LINEITEM_ROWS}}, generate full <tr>...</tr> HTML.\n"
                "Match ONLY the columns present in the template's <thead> — do NOT add extra columns.\n"
                "Example (4-column table: #, Description, Qty, Line Total):\n"
                "  <tr><td>1</td><td>Office chairs</td><td class='num'>4</td><td class='num'>$480.00</td></tr>\n"
                "\n"
                "Keep ALL HTML tags, CSS, classes, and IDs EXACTLY as-is.\n"
                "Do NOT modify any <style> blocks, structural HTML, or class names."
            ),
        ),
        models.ChatMessage(
            role="user",
            content=f"Outline/context (data to fill into template):\n{outline_text}",
        ),
    ]
    if has_logo:
        messages.append(
            models.ChatMessage(
                role="user",
                content=(
                    "LOGO:\n"
                    "- A company logo is available.\n"
                    "- Insert the exact placeholder text {{LOGO_BLOCK}} once where the logo should appear.\n"
                    "- Do NOT create your own <img> for the logo; only place {{LOGO_BLOCK}}.\n"
                ),
            )
        )
    if additional_instructions and additional_instructions.strip():
        messages.append(
            models.ChatMessage(
                role="user",
                content=(
                    "ADDITIONAL INSTRUCTIONS (highest priority):\n"
                    f"{additional_instructions.strip()}\n\n"
                    "Apply these instructions while preserving the template structure."
                ),
            )
        )
    messages.append(
        models.ChatMessage(
            role="user",
            content=(
                f"COMPLETE HTML TEMPLATE (copy ALL of this, replacing ONLY {{{{PLACEHOLDER}}}} tokens):\n\n{template_html}"
            ),
        )
    )
    if draft_sections:
        sections_payload = [section.model_dump(by_alias=True, exclude_none=True) for section in draft_sections]
        messages.append(
            models.ChatMessage(
                role="user",
                content=f"Section content (JSON):\n{json.dumps(sections_payload, ensure_ascii=True)}",
            )
        )

    stream = stream_ai(
        SMART_MODEL,
        messages,
        tag="html_template_fill_stream",
        log_label="html-template-fill-stream",
    )
    yield from stream
    if stream.error or not stream.chunks:
        raise RuntimeError(f"AI HTML template fill failed: {stream.error or 'no chunks streamed'}")


def generate_html_with_llm(
    prompt: str,
    history: list[models.ChatMessage],
    document_type: str,
    template_hint: str | None = None,
    current_html: str | None = None,
    structured_brief: str | None = None,
) -> str:
    """Call the LLM for freeform HTML document generation."""
    messages: list[models.ChatMessage] = [
        models.ChatMessage(role="system", content=html_system_prompt(document_type, template_hint))
    ]
    messages.extend(history)
    messages.extend(html_context_messages(template_hint, current_html, structured_brief))
    messages.append(models.ChatMessage(role="user", content=prompt))

    logger.info(
        "[AI] HTML generation model=%s doc_type=%s template_hint=%s",
        SMART_MODEL,
        document_type,
        "yes" if template_hint else "no",
    )
    parsed = run_ai(
        SMART_MODEL,
        messages,
        models.HtmlResponse,
        tag="html_generate",
    )
    if parsed and parsed.html and parsed.html.strip():
        logger.info("[AI] Generated HTML preview (first 500 chars):\n%s", parsed.html[:500])
        return parsed.html

    raise RuntimeError("AI HTML generation failed or returned empty output.")


def generate_html_with_llm_stream(
    prompt: str,
    history: list[models.ChatMessage],
    document_type: str,
    template_hint: str | None = None,
    current_html: str | None = None,
    structured_brief: str | None = None,
):
    """Stream HTML generation from LLM, yielding chunks as they arrive."""
    if not STREAMING_ENABLED:
        full_html = generate_html_with_llm(
            prompt,
            history,
            document_type,
            template_hint,
            current_html,
            structured_brief,
        )
        yield full_html
        return

    messages: list[models.ChatMessage] = [
        models.ChatMessage(role="system", content=html_system_prompt(document_type, template_hint))
    ]
    messages.extend(history)
    messages.extend(html_context_messages(template_hint, current_html, structured_brief))
    messages.append(models.ChatMessage(role="user", content=prompt))

    logger.info(
        "[AI] Streaming HTML model=%s doc_type=%s template_hint=%s",
        SMART_MODEL,
        document_type,
        "yes" if template_hint else "no",
    )
    stream = stream_ai(
        SMART_MODEL,
        messages,
        tag="html_stream",
        log_label="html-stream",
    )
    yield from stream

    if stream.error or not stream.chunks:
        raise RuntimeError(f"AI HTML streaming failed: {stream.error or 'no chunks produced'}")


def edit_html_with_llm_stream(
    *,
    document_type: str,
    base_html: str,
    instructions: str,
):
    """Stream an updated full HTML document by editing an existing HTML input."""
    if not base_html or not base_html.strip():
        raise RuntimeError("Missing base_html for HTML revision")
    if not instructions or not instructions.strip():
        raise RuntimeError("Missing instructions for HTML revision")

    system_prompt = html_edit_system_prompt(document_type)
    messages: list[models.ChatMessage] = [
        models.ChatMessage(role="system", content=system_prompt),
        models.ChatMessage(
            role="user",
            content=f"CURRENT_HTML (you MUST preserve everything not explicitly requested):\n\n{base_html}",
        ),
    ]

    messages.append(
        models.ChatMessage(
            role="user",
            content=f"INSTRUCTIONS:\n{instructions}\n\nReturn ONLY the full updated HTML document.",
        )
    )

    stream = stream_ai(
        SMART_MODEL,
        messages,
        tag="html_edit_stream",
        log_label="html-edit-stream",
    )
    yield from stream

    if stream.error or not stream.chunks:
        raise RuntimeError(f"AI HTML edit streaming failed: {stream.error or 'no chunks produced'}")


__all__ = [
    "generate_field_values",
    "generate_html_with_llm",
    "generate_html_with_llm_stream",
    "generate_outline_with_llm",
    "generate_section_draft",
    "generate_template_fill_html_stream",
    "edit_html_with_llm_stream",
]
