from __future__ import annotations

import base64
import os
import subprocess
import tempfile
import time
from typing import List, Optional

from config import OUTPUT_DIR, logger


_FONT_SPEC_MARKERS = (
    "\\usepackage{fontspec}",
    "\\setmainfont",
    "\\setsansfont",
    "\\setmonofont",
    "\\newfontfamily",
)


def _needs_unicode_engine(latex_code: str) -> bool:
    return any(marker in latex_code for marker in _FONT_SPEC_MARKERS)


def _run_latex(engine: str, tex_filename: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [engine, "-interaction=nonstopmode", "-output-directory", OUTPUT_DIR, tex_filename],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=30,
        cwd=OUTPUT_DIR,
    )


def render_pdf_to_images(pdf_bytes: bytes, max_pages: int = 2, dpi: int = 160) -> List[str]:
    """Render the first N pages of a PDF to base64-encoded PNG data URLs."""
    images: List[str] = []
    with tempfile.TemporaryDirectory() as tmpdir:
        pdf_path = os.path.join(tmpdir, "upload.pdf")
        with open(pdf_path, "wb") as handle:
            handle.write(pdf_bytes)

        output_prefix = os.path.join(tmpdir, "page")
        try:
            subprocess.run(
                [
                    "pdftoppm",
                    "-png",
                    "-r",
                    str(dpi),
                    "-f",
                    "1",
                    "-l",
                    str(max_pages),
                    pdf_path,
                    output_prefix,
                ],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=30,
            )
        except Exception as exc:
            logger.error("[IMPORT] pdftoppm failed: %s", exc)
            return images

        for idx in range(1, max_pages + 1):
            img_path = f"{output_prefix}-{idx}.png"
            if os.path.exists(img_path):
                with open(img_path, "rb") as img_handle:
                    encoded = base64.b64encode(img_handle.read()).decode("utf-8")
                    images.append(f"data:image/png;base64,{encoded}")
    return images


def compile_latex_to_pdf(
    latex_code: str,
    job_id: str,
    *,
    log_errors: bool = True,
    raise_on_error: bool = False,
) -> Optional[str]:
    """Compile a LaTeX document and return the PDF path."""
    tex_filename = os.path.join(OUTPUT_DIR, f"{job_id}.tex")
    pdf_filename = f"{job_id}.pdf"
    pdf_path = os.path.join(OUTPUT_DIR, pdf_filename)

    with open(tex_filename, "w", encoding="utf-8") as handle:
        handle.write(latex_code)

    try:
        t_start = time.perf_counter()
        engine = "xelatex" if _needs_unicode_engine(latex_code) else "pdflatex"
        first = _run_latex(engine, tex_filename)
        if first.returncode != 0 and engine == "pdflatex":
            error_output = first.stderr.decode() or first.stdout.decode()
            if "fontspec" in error_output and ("XeTeX" in error_output or "LuaTeX" in error_output):
                logger.info("[PDF] pdflatex failed due to fontspec; retrying with xelatex")
                engine = "xelatex"
                first = _run_latex(engine, tex_filename)
        t_first = time.perf_counter()
        if first.returncode == 0:
            _run_latex(engine, tex_filename)
        t_end = time.perf_counter()

        if os.path.exists(pdf_path):
            logger.info(
                "[PDF] compiled job_id=%s -> %s (engine=%s first_pass=%.2fs total=%.2fs)",
                job_id,
                pdf_filename,
                engine,
                t_first - t_start,
                t_end - t_start,
            )
            return pdf_path

        error_output = first.stderr.decode() or first.stdout.decode()
        message = error_output.strip() or f"{engine} failed without stderr output"
        if log_errors:
            logger.error(
                "[PDF] not generated job_id=%s code=%s engine=%s after %.2fs: %s",
                job_id,
                first.returncode,
                engine,
                t_first - t_start,
                message,
            )
        if raise_on_error:
            raise RuntimeError(message)
        return None
    except subprocess.TimeoutExpired:
        message = f"LaTeX compilation timed out for job_id={job_id}"
        if log_errors:
            logger.error(message)
        if raise_on_error:
            raise
        return None
    except Exception as exc:
        if log_errors:
            logger.error("LaTeX compilation failed: %s", exc)
        if raise_on_error:
            raise
        return None


__all__ = ["render_pdf_to_images", "compile_latex_to_pdf"]
