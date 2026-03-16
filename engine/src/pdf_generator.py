from __future__ import annotations

import json
import logging
import os
import re
import time
from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, assert_never

from bs4 import BeautifulSoup, Tag

import analytics
from ai_generation import (
    edit_html_with_llm_stream,
    generate_html_with_llm_stream,
    generate_outline_with_llm,
    generate_section_draft,
    generate_template_fill_html_stream,
)
from config import OUTPUT_DIR
from editing.operations import sanitize_filename
from html_pdf_utils import compile_html_to_pdf
from html_utils import (
    build_theme_css,
    clean_generated_html,
    inject_empty_section_hider,
    inject_header_css,
    inject_logo,
    inject_theme,
    strip_logo_to_placeholder,
)
from models import AISession, Constraint, CreateStreamPhase, DraftSection, JavaUpdateSessionRequest
from prompts import html_polish_prompt

logger = logging.getLogger(__name__)

# Directory containing the default HTML and LaTeX templates
_DEFAULT_TEMPLATES_DIR = Path(__file__).resolve().parent / "default_templates"


def _persist_raw_html(job_id: str, html: str) -> None:
    """Persist the HTML used to generate a PDF next to the output PDF."""
    try:
        path = Path(OUTPUT_DIR) / f"{job_id}.raw.html"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(html, encoding="utf-8", errors="replace")
    except OSError:  # pragma: no cover - best-effort persistence
        logger.exception("[STREAM] Failed to persist raw HTML for job_id=%s", job_id)


def _strip_to_html(chunks: Iterator[str]) -> Iterator[str]:
    """Buffer streamed LLM output until the start of an HTML document is found.

    LLMs sometimes prefix HTML with markdown code fences (```html) or preamble
    text. This filter discards everything before the first ``<!doctype`` or
    ``<html`` tag so the live preview only ever receives valid HTML tokens.
    If no HTML start is found the buffered content is yielded as a fallback.
    """
    preamble = ""
    found = False
    for chunk in chunks:
        if found:
            yield chunk
        else:
            preamble += chunk
            lower = preamble.lower()
            idx = lower.find("<!doctype")
            if idx == -1:
                idx = lower.find("<html")
            if idx != -1:
                found = True
                yield preamble[idx:]
    if not found and preamble:
        yield preamble


@dataclass(slots=True)
class PDFGenerator:
    session_id: str
    phase: CreateStreamPhase
    prompt: str
    doc_type: str
    template_id: str | None
    outline_text: str
    outline_filename: str | None
    constraints: Constraint | None
    draft_sections: list[DraftSection] | None
    update_session: Callable[[str, JavaUpdateSessionRequest], AISession]
    theme: dict[str, str] | None = field(default=None)
    logo_base64: str | None = field(default=None)
    base_html: str | None = field(default=None)
    instructions: str | None = field(default=None)

    def generate(self) -> Iterator[str]:
        # For the polish phase, tell the frontend which renderer will be used so it
        # can pre-mount the preview workbench before the first token arrives.
        phase_event: dict[str, str] = {"type": "phase_changed", "phase": self.phase.value}
        if self.phase in (CreateStreamPhase.POLISH, CreateStreamPhase.REVISE):
            phase_event["renderer"] = "html"
        yield self._sse(phase_event)

        if self.phase == CreateStreamPhase.OUTLINE:
            yield from self._handle_outline()
        elif self.phase == CreateStreamPhase.DRAFT:
            yield from self._handle_draft()
        elif self.phase == CreateStreamPhase.POLISH:
            yield from self._handle_polish()
        elif self.phase == CreateStreamPhase.REVISE:
            yield from self._handle_revise()
        else:
            assert_never(self.phase)

    def _handle_outline(self) -> Iterator[str]:
        outline_start = time.time()

        # doc_type should already be detected and set
        outline_response = generate_outline_with_llm(self.prompt, self.doc_type, self.constraints)
        outline_duration = (time.time() - outline_start) * 1000

        # Update session with outline data
        self.update_session(
            self.session_id,
            JavaUpdateSessionRequest(
                outline_filename=outline_response.outline_filename,
                outline_constraints=self.constraints,
                status="OUTLINE_PENDING",
            ),
        )

        analytics.track_event(
            user_id=self.session_id,
            event_name="outline_generated",
            properties={
                "session_id": self.session_id,
                "doc_type": self.doc_type,
                "section_count": len(outline_response.sections),
                "generation_time_ms": outline_duration,
                "has_constraints": bool(self.constraints),
            },
        )

        # Use Pydantic model_dump() for serialization - NO manual JSON building
        outline_data = outline_response.model_dump(by_alias=True, exclude_none=True)

        # Send structured data directly to frontend
        yield self._sse(
            {
                "type": "outline_ready",
                **outline_data,  # Spreads: doc_type, sections, outline_filename
            }
        )
        yield self._sse({"type": "phase_complete", "phase": CreateStreamPhase.OUTLINE.value})

    def _handle_draft(self) -> Iterator[str]:
        draft_start = time.time()
        base_outline = self.outline_text or self.prompt
        sections = generate_section_draft(self.prompt, self.doc_type, base_outline, self.constraints)
        draft_duration = (time.time() - draft_start) * 1000

        sections_payload = [section.model_dump(by_alias=True, exclude_none=True) for section in sections]
        self.update_session(
            self.session_id,
            JavaUpdateSessionRequest(
                draft_sections=sections,
                outline_constraints=self.constraints,
                doc_type=self.doc_type,
                status="DRAFT_READY",
            ),
        )

        analytics.track_event(
            user_id=self.session_id,
            event_name="draft_generated",
            properties={
                "session_id": self.session_id,
                "doc_type": self.doc_type,
                "section_count": len(sections),
                "generation_time_ms": draft_duration,
                "has_constraints": bool(self.constraints),
            },
        )

        yield self._sse({"type": "draft_sections", "sections": sections_payload})
        yield self._sse(
            {"type": "phase_complete", "phase": CreateStreamPhase.DRAFT.value, "sections": sections_payload}
        )

    def _load_template_html(self) -> str | None:
        """Load the HTML template for this document type from default_templates."""
        safe_doc_type = re.sub(r"[^a-zA-Z0-9_]+", "", self.doc_type.lower())
        html_path = _DEFAULT_TEMPLATES_DIR / f"{safe_doc_type}.html"
        if html_path.exists():
            logger.info("[TEMPLATE] Loaded HTML template: %s", html_path.name)
            return html_path.read_text(encoding="utf-8", errors="replace")
        logger.warning("[TEMPLATE] No HTML template found for doc_type=%s at %s", self.doc_type, html_path)
        return None

    def _build_section_text(self) -> str:
        if not self.draft_sections:
            return ""
        return "\n".join(f"{section.label or 'Section'}: {section.value or ''}" for section in self.draft_sections)

    def _build_constraint_text(self) -> str:
        if not self.constraints:
            return ""
        return (
            f"Tone: {self.constraints.tone}. "
            f"Audience: {self.constraints.audience}. "
            f"Target pages: {self.constraints.page_count}."
        )

    def _build_output_basename(self) -> str:
        if self.outline_filename:
            sanitized = sanitize_filename(self.outline_filename)
            return sanitized
        else:
            session_dir = os.path.join(OUTPUT_DIR, self.session_id)
            next_number = 1
            if os.path.isdir(session_dir):
                pattern = re.compile(r"^document(\d+)(?:\.pdf)?$", re.IGNORECASE)
                for name in os.listdir(session_dir):
                    match = pattern.match(name)
                    if match:
                        next_number = max(next_number, int(match.group(1)) + 1)
            return f"document{next_number}"

    def _handle_polish(self) -> Iterator[str]:
        """All document types use the HTML generation path."""
        yield from self._handle_polish_html()

    def _handle_revise(self) -> Iterator[str]:
        """Revise an existing HTML document, then compile via Puppeteer."""
        yield from self._handle_revise_html()

    # ── HTML polish path ──────────────────────────────────────────────────────

    def _handle_polish_html(self) -> Iterator[str]:
        """Generate and compile an HTML document using Puppeteer."""
        accumulated = ""
        additional_instructions = (self.instructions or "").strip()
        template_html = self._load_template_html()

        if template_html:
            for chunk in generate_template_fill_html_stream(
                template_html,
                self.doc_type,
                self.outline_text or self.prompt,
                draft_sections=self.draft_sections,
                constraints=self.constraints,
                theme=self.theme,
                additional_instructions=additional_instructions or None,
                has_logo=bool(self.logo_base64),
            ):
                accumulated += chunk
                yield self._sse({"type": "html_delta", "phase": CreateStreamPhase.POLISH.value, "delta": chunk})
        else:
            section_text = self._build_section_text()
            constraint_text = self._build_constraint_text()
            polish_prompt_str = html_polish_prompt(self.doc_type, constraint_text)
            structured_brief = section_text or self.outline_text or self.prompt
            if additional_instructions:
                structured_brief = (
                    f"{structured_brief}\n\nAdditional instructions (highest priority):\n{additional_instructions}"
                )
            raw_stream = generate_html_with_llm_stream(
                polish_prompt_str,
                [],
                self.doc_type,
                None,
                None,
                structured_brief,
            )
            for chunk in _strip_to_html(raw_stream):
                accumulated += chunk
                yield self._sse({"type": "html_delta", "phase": CreateStreamPhase.POLISH.value, "delta": chunk})

        accumulated = clean_generated_html(accumulated)

        accumulated = inject_header_css(accumulated)
        accumulated = inject_logo(accumulated, self.logo_base64)

        # Always inject theme so user overrides take precedence over template defaults.
        # inject_theme appends a <style id='docgen-theme'> block after the template's
        # own :root block, so the later declaration wins the CSS cascade.
        logger.info(
            "[THEME] session_id=%s received theme keys=%s values=%s",
            self.session_id,
            list(self.theme.keys()) if self.theme else "none",
            self.theme if self.theme else "none (using defaults)",
        )
        accumulated = inject_theme(accumulated, self.theme)
        # Log the injected CSS block so we can verify what Puppeteer will see
        injected_css = build_theme_css(self.theme)
        logger.info(
            "[THEME] session_id=%s injected CSS:\n%s",
            self.session_id,
            injected_css,
        )

        # Inject trusted script to hide empty/unfilled sections at render time
        accumulated = inject_empty_section_hider(accumulated)
        # Do NOT inject doc-header layout shim in revise mode. It constrains logo placement.

        self.update_session(
            self.session_id,
            JavaUpdateSessionRequest(
                polished_html=accumulated,
                doc_type=self.doc_type,
                status="POLISHED_READY",
            ),
        )

        analytics.track_event(
            user_id=self.session_id,
            event_name="html_generated",
            properties={
                "session_id": self.session_id,
                "doc_type": self.doc_type,
                "html_length": len(accumulated),
                "has_template": bool(template_html),
            },
        )

        # Strip the embedded base64 logo back to placeholder for storage.
        # This prevents logo corruption in PDF metadata (base64 round-trips through pypdf
        # are lossy) and also gives the AI a clean {{LOGO_BLOCK}} placeholder to work
        # with on subsequent revisions instead of an opaque multi-KB data URL.
        raw_html_for_storage = strip_logo_to_placeholder(accumulated)

        pdf_job_id = f"{self.session_id}/{self._build_output_basename()}"
        _persist_raw_html(pdf_job_id, raw_html_for_storage)

        yield self._sse({"type": "status", "message": "Generating PDF from HTML..."})
        pdf_compile_start = time.time()

        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(
                compile_html_to_pdf,
                accumulated,
                pdf_job_id,
                log_errors=True,
                embed_raw_html_metadata=True,
                raw_html_override=raw_html_for_storage,
            )
            while True:
                try:
                    html_result = future.result(timeout=10)
                    break
                except FutureTimeout:
                    yield self._sse({"type": "status", "message": "Generating PDF from HTML..."})

        pdf_compile_duration = (time.time() - pdf_compile_start) * 1000

        analytics.track_event(
            user_id=self.session_id,
            event_name="html_pdf_compilation",
            properties={
                "session_id": self.session_id,
                "doc_type": self.doc_type,
                "compilation_time_ms": pdf_compile_duration,
                "success": html_result.pdf_path is not None,
                "error_message": html_result.error,
            },
        )

        if html_result.pdf_path and os.path.exists(html_result.pdf_path):
            pdf_url = f"/output/{pdf_job_id}.pdf"
            pdf_size = os.path.getsize(html_result.pdf_path)

            self.update_session(
                self.session_id,
                JavaUpdateSessionRequest(
                    pdf_url=pdf_url,
                    status="SAVED",
                ),
            )

            analytics.track_event(
                user_id=self.session_id,
                event_name="document_completed",
                properties={
                    "session_id": self.session_id,
                    "doc_type": self.doc_type,
                    "pdf_size_bytes": pdf_size,
                    "html_length": len(accumulated),
                    "has_template": bool(template_html),
                    "renderer": "puppeteer",
                },
            )

            yield self._sse({"type": "save_complete", "docId": self.session_id, "pdfUrl": pdf_url})
        else:
            error_msg = html_result.error or "Unknown HTML PDF generation error"
            logger.error(
                "[STREAM] HTML PDF generation failed session_id=%s job_id=%s: %s",
                self.session_id,
                pdf_job_id,
                error_msg,
            )
            yield self._sse({"type": "error", "message": f"PDF generation failed: {error_msg}"})

        yield self._sse(
            {"type": "phase_complete", "phase": CreateStreamPhase.POLISH.value, "html": raw_html_for_storage}
        )

    def _handle_revise_html(self) -> Iterator[str]:
        accumulated = ""
        base_html = self.base_html or ""
        instructions = (self.instructions or "").strip()
        if not base_html.strip() or not instructions:
            yield self._sse({"type": "error", "message": "Missing baseHtml or instructions for PDF regeneration."})
            yield self._sse({"type": "phase_complete", "phase": CreateStreamPhase.REVISE.value, "html": ""})
            return

        # The polish pipeline injects a CSS-only header layout shim (docgen-header-layout) that
        # enforces "logo left". For revise mode we want the AI to control placement, so strip
        # this shim from the base HTML before asking the model to edit it. We also avoid re-
        # injecting it later in this revise compilation path.
        soup = BeautifulSoup(base_html, "html.parser")
        header_shim = soup.find("style", id="docgen-header-layout")
        if isinstance(header_shim, Tag):
            header_shim.decompose()
            base_html = str(soup)

        # Replace any injected company-logo <img> with {{LOGO_BLOCK}} so the AI receives a
        # small, editable placeholder instead of a multi-KB opaque base64 data URL.
        # This also handles old documents whose stored HTML still contains the raw base64.
        base_html = strip_logo_to_placeholder(base_html)

        raw_stream = edit_html_with_llm_stream(
            document_type=self.doc_type,
            base_html=base_html,
            instructions=instructions,
        )
        for chunk in _strip_to_html(raw_stream):
            accumulated += chunk
            yield self._sse({"type": "html_delta", "phase": CreateStreamPhase.REVISE.value, "delta": chunk})

        accumulated = clean_generated_html(accumulated)
        accumulated = inject_header_css(accumulated)
        accumulated = inject_logo(accumulated, self.logo_base64)

        logger.info(
            "[THEME] session_id=%s received theme keys=%s values=%s",
            self.session_id,
            list(self.theme.keys()) if self.theme else "none",
            self.theme if self.theme else "none (using defaults)",
        )
        accumulated = inject_theme(accumulated, self.theme)

        # Inject trusted script to hide empty/unfilled sections at render time
        accumulated = inject_empty_section_hider(accumulated)
        # Do NOT inject doc-header layout shim. Logo placement is controlled by the LLM via {{LOGO_BLOCK}}.

        self.update_session(
            self.session_id,
            JavaUpdateSessionRequest(
                polished_html=accumulated,
                doc_type=self.doc_type,
                status="POLISHED_READY",
            ),
        )

        # Strip embedded base64 logo back to placeholder for storage — same reasoning as
        # the polish path: avoids PDF metadata corruption and gives the AI a clean
        # {{LOGO_BLOCK}} to work with on the next revision.
        raw_html_for_storage = strip_logo_to_placeholder(accumulated)

        pdf_job_id = f"{self.session_id}/{self._build_output_basename()}"
        _persist_raw_html(pdf_job_id, raw_html_for_storage)
        yield self._sse({"type": "status", "message": "Generating PDF from HTML..."})

        pdf_compile_start = time.time()
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(
                compile_html_to_pdf,
                accumulated,
                pdf_job_id,
                log_errors=True,
                embed_raw_html_metadata=True,
                raw_html_override=raw_html_for_storage,
            )
            while True:
                try:
                    html_result = future.result(timeout=10)
                    break
                except FutureTimeout:
                    yield self._sse({"type": "status", "message": "Generating PDF from HTML..."})

        pdf_compile_duration = (time.time() - pdf_compile_start) * 1000

        analytics.track_event(
            user_id=self.session_id,
            event_name="html_pdf_compilation",
            properties={
                "session_id": self.session_id,
                "doc_type": self.doc_type,
                "compilation_time_ms": pdf_compile_duration,
                "success": html_result.pdf_path is not None,
                "error_message": html_result.error,
            },
        )

        if html_result.pdf_path and os.path.exists(html_result.pdf_path):
            pdf_url = f"/output/{pdf_job_id}.pdf"
            pdf_size = os.path.getsize(html_result.pdf_path)

            self.update_session(
                self.session_id,
                JavaUpdateSessionRequest(
                    pdf_url=pdf_url,
                    status="SAVED",
                ),
            )

            analytics.track_event(
                user_id=self.session_id,
                event_name="document_completed",
                properties={
                    "session_id": self.session_id,
                    "doc_type": self.doc_type,
                    "pdf_size_bytes": pdf_size,
                    "html_length": len(accumulated),
                    "has_template": None,
                    "renderer": "puppeteer",
                    "mode": "revise",
                },
            )
            yield self._sse({"type": "save_complete", "docId": self.session_id, "pdfUrl": pdf_url})
        else:
            error_msg = html_result.error or "Unknown HTML PDF generation error"
            logger.error(
                "[STREAM] HTML PDF generation failed session_id=%s job_id=%s: %s",
                self.session_id,
                pdf_job_id,
                error_msg,
            )
            yield self._sse({"type": "error", "message": f"PDF generation failed: {error_msg}"})

        yield self._sse(
            {"type": "phase_complete", "phase": CreateStreamPhase.REVISE.value, "html": raw_html_for_storage}
        )

    @staticmethod
    def _sse(data: dict[str, Any]) -> str:
        return f"data: {json.dumps(data)}\n\n"
