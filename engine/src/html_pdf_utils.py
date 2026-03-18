from __future__ import annotations

import base64
import gzip
import logging
import os
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pypdf import PdfReader, PdfWriter
from pypdf.errors import PdfReadError, PdfStreamError

from config import OUTPUT_DIR

logger = logging.getLogger(__name__)

# Absolute path to the Puppeteer script
_SCRIPT_PATH = Path(__file__).resolve().parent / "html_to_pdf.mjs"


@dataclass(slots=True)
class HtmlCompileResult:
    pdf_path: str | None
    error: str | None


def _encode_raw_html_for_pdf_metadata(raw_html: str) -> str:
    """Gzip-compress and base64-encode HTML so it fits in the PDF Info dictionary."""
    compressed = gzip.compress(raw_html.encode("utf-8"), compresslevel=9)
    b64 = base64.b64encode(compressed).decode("ascii")
    return f"gzip-base64:{b64}"


def _inject_raw_html_pdf_metadata(pdf_path: str, raw_html: str) -> None:
    """Embed *raw_html* in the PDF Info dictionary so it travels with the file.

    This is what allows a PDF to remain re-generatable across sessions and after
    being shared or re-uploaded — the HTML is read back out of the PDF metadata
    by the frontend when the file is loaded.
    """
    if not raw_html:
        return

    try:
        reader = PdfReader(pdf_path)
        writer = PdfWriter()
        writer.append_pages_from_reader(reader)

        existing: dict[str, Any] = dict(reader.metadata) if reader.metadata else {}
        existing["/raw_html"] = _encode_raw_html_for_pdf_metadata(raw_html)
        writer.add_metadata(existing)

        # Write to a temporary file first, then atomically replace the original.
        # This ensures the PDF at pdf_path is never left in a partially-written
        # (corrupt) state if the write is interrupted.
        with tempfile.NamedTemporaryFile(
            mode="wb",
            dir=os.path.dirname(pdf_path),
            delete=False,
            suffix=".tmp",
            prefix="docgen_meta_",
        ) as tmp:
            tmp_path = tmp.name
            writer.write(tmp)

        os.replace(tmp_path, pdf_path)
    except (PdfReadError, PdfStreamError, OSError):
        logger.exception("[HTML→PDF] Failed to inject raw_html metadata into %s", pdf_path)


def compile_html_to_pdf(
    html_content: str,
    job_id: str,
    timeout: int = 120,
    log_errors: bool = True,
    embed_raw_html_metadata: bool = False,
    raw_html_override: str | None = None,
) -> HtmlCompileResult:
    """
    Convert an HTML string to PDF using Puppeteer (Node.js).

    job_id format: "<session_id>/<basename>" — mirrors the LaTeX compile path.
    Returns HtmlCompileResult with pdf_path on success, error message on failure.

    If *embed_raw_html_metadata* is True, the source HTML is embedded in the PDF
    Info dictionary so the file remains re-generatable after sharing or re-upload.
    Pass *raw_html_override* to embed a different HTML string than what was rendered
    (e.g. the logo-stripped version used for storage).
    """
    # Build output path
    parts = job_id.split("/", 1)
    if len(parts) == 2:
        session_id, basename = parts
        out_dir = Path(OUTPUT_DIR) / session_id
    else:
        out_dir = Path(OUTPUT_DIR)
        basename = job_id

    out_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = str(out_dir / f"{basename}.pdf")

    # Write HTML to a temp file so Puppeteer can load it via file://
    tmp_html: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            suffix=".html",
            delete=False,
            encoding="utf-8",
            prefix="docgen_",
        ) as f:
            f.write(html_content)
            tmp_html = f.name

        if not _SCRIPT_PATH.exists():
            msg = f"Puppeteer script not found: {_SCRIPT_PATH}"
            logger.error("[HTML→PDF] %s", msg)
            return HtmlCompileResult(pdf_path=None, error=msg)

        result = subprocess.run(
            ["node", str(_SCRIPT_PATH), tmp_html, pdf_path],
            capture_output=True,
            text=True,
            timeout=timeout,
        )

        if result.returncode != 0:
            stderr = result.stderr.strip() or result.stdout.strip() or "Unknown Puppeteer error"
            if log_errors:
                logger.error("[HTML→PDF] Puppeteer failed (exit %d): %s", result.returncode, stderr[:500])
            return HtmlCompileResult(pdf_path=None, error=stderr[:2000])

        if not os.path.exists(pdf_path):
            msg = "Puppeteer exited cleanly but no PDF output found"
            if log_errors:
                logger.error("[HTML→PDF] %s at %s", msg, pdf_path)
            return HtmlCompileResult(pdf_path=None, error=msg)

        if embed_raw_html_metadata:
            _inject_raw_html_pdf_metadata(
                pdf_path,
                raw_html_override if raw_html_override is not None else html_content,
            )

        size_kb = os.path.getsize(pdf_path) / 1024
        logger.info("[HTML→PDF] Success: %s (%.1f KB)", pdf_path, size_kb)
        return HtmlCompileResult(pdf_path=pdf_path, error=None)

    except subprocess.TimeoutExpired:
        msg = f"HTML→PDF timed out after {timeout}s"
        if log_errors:
            logger.error("[HTML→PDF] %s", msg)
        return HtmlCompileResult(pdf_path=None, error=msg)

    except FileNotFoundError:
        msg = "Node.js not found — install Node.js to enable HTML PDF generation"
        if log_errors:
            logger.error("[HTML→PDF] %s", msg)
        return HtmlCompileResult(pdf_path=None, error=msg)

    finally:
        if tmp_html:
            try:
                os.unlink(tmp_html)
            except OSError:
                pass


__all__ = ["HtmlCompileResult", "compile_html_to_pdf"]
