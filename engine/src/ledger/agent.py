"""
Ledger Auditor — the two pydantic-ai agents.

LedgerExaminer  (Round 1, /api/ledger/examine)
    Receives a FolioManifest and returns a Requisition declaring what
    Java must extract before validation can begin.

LedgerAuditor   (Round 2, /api/ledger/deliberate)
    Processes Evidence per-page:
      1. Deterministic pass — TallyChecker + ArithmeticScanner on every folio
      2. Fast-model pass  — extract named figures from each page (parallel)
      3. FigureTracker    — cross-page consistency check
      4. Fast-model call  — generate human-readable summary
      5. Assemble Verdict programmatically

Neither agent ever touches a PDF file. All content arrives pre-extracted
by Java, which owns the PDF from start to finish.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Final

from pydantic import BaseModel, Field
from pydantic_ai import Agent

from ai_logging import SessionLogger
from config import FAST_MODEL, get_pydantic_ai_model_id
from .models import (
    Discrepancy, Evidence, Folio,
    FolioManifest, Requisition, Verdict,
)
from .prompts import (
    EXAMINER_SYSTEM_PROMPT,
    FIGURE_EXTRACTOR_PROMPT,
    SUMMARY_PROMPT,
)
from .validators import ArithmeticScanner, FigureTracker, TallyChecker

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# LedgerExaminer — Round 1: inspect the manifest, declare the requisition
# ---------------------------------------------------------------------------

ledger_examiner: Final[Agent[FolioManifest, Requisition]] = Agent(
    model=get_pydantic_ai_model_id(FAST_MODEL),
    deps_type=FolioManifest,
    output_type=Requisition,
    system_prompt=EXAMINER_SYSTEM_PROMPT,
)


def examine(manifest: FolioManifest) -> Requisition:
    """
    Run the Examiner against a FolioManifest.
    Returns the Requisition the auditor needs Java to fulfil.
    Synchronous — safe to call directly from a Flask route handler.
    """
    slog = SessionLogger(manifest.session_id)
    logger.info(
        "[ledger] session=%s round=%d examining %d folios",
        manifest.session_id,
        manifest.round,
        manifest.page_count,
    )

    user_prompt = (
        "Examine this folio manifest and declare your requisition:\n"
        + manifest.model_dump_json()
    )
    slog.request("examine", body={
        "model": get_pydantic_ai_model_id(FAST_MODEL),
        "system_prompt": EXAMINER_SYSTEM_PROMPT,
        "user_prompt": user_prompt,
    })

    result = ledger_examiner.run_sync(user_prompt, deps=manifest)
    req = result.output

    slog.response("examine", body=req.model_dump())
    logger.info(
        "[ledger] session=%s requisition: text=%s tables=%s ocr=%s",
        manifest.session_id,
        req.need_text,
        req.need_tables,
        req.need_ocr,
    )
    slog.close()
    return req


# ---------------------------------------------------------------------------
# Structured output models for the per-page figure extractor
# ---------------------------------------------------------------------------


class ExtractedFigure(BaseModel):
    """A single named figure found on a page."""
    label: str = Field(description="Normalised name, e.g. 'Total Revenue', 'VAT'.")
    value: str = Field(description="Numeric value as a string, e.g. '1200.00'.")
    raw: str = Field(description="Original text from the document, e.g. '£1,200.00'.")


class FigureExtractionResult(BaseModel):
    """All named figures found on a single page."""
    figures: list[ExtractedFigure] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Per-page figure extractor — fast model, one call per page
# ---------------------------------------------------------------------------

figure_extractor: Final[Agent[None, FigureExtractionResult]] = Agent(
    model=get_pydantic_ai_model_id(FAST_MODEL),
    output_type=FigureExtractionResult,
    system_prompt=FIGURE_EXTRACTOR_PROMPT,
)


def _extract_figures_for_page(
    folio: Folio,
    slog: SessionLogger | None,
) -> list[tuple[ExtractedFigure, int]]:
    """
    Ask the fast model to identify named figures on a single page.
    Returns list of (figure, page_number) tuples.
    """
    text = folio.readable_text
    if not text or not text.strip():
        return []

    logger.info(
        "[ledger] extracting figures from page %d (%d chars)",
        folio.page, len(text),
    )
    prompt = f"Page {folio.page + 1} text:\n{text}"
    try:
        result = figure_extractor.run_sync(prompt)
        figures = result.output.figures
    except Exception:
        logger.warning(
            "[ledger] figure extraction failed for page %d, skipping",
            folio.page,
            exc_info=True,
        )
        figures = []

    if slog:
        slog.tool_call("extract_figures", args={
            "page": folio.page,
            "text_length": len(text),
        }, result=[f.model_dump() for f in figures])

    return [(fig, folio.page) for fig in figures]


# ---------------------------------------------------------------------------
# Summary generator — fast model, one call with just the discrepancy list
# ---------------------------------------------------------------------------

summary_agent: Final[Agent[None, str]] = Agent(
    model=get_pydantic_ai_model_id(FAST_MODEL),
    output_type=str,
    system_prompt=SUMMARY_PROMPT,
)


def _generate_summary(
    discrepancies: list[Discrepancy],
    pages_examined: list[int],
    unauditable_pages: list[int],
    slog: SessionLogger | None,
) -> str:
    """Generate a 1-2 sentence user-facing summary from the discrepancy list."""
    error_count = sum(1 for d in discrepancies if d.severity == "error")
    warning_count = sum(1 for d in discrepancies if d.severity == "warning")

    prompt = (
        f"Errors: {error_count}, Warnings: {warning_count}, "
        f"Pages examined: {len(pages_examined)}, "
        f"Unauditable pages: "
        f"{unauditable_pages or 'none'}.\n"
    )
    if discrepancies:
        prompt += "Discrepancies:\n"
        for d in discrepancies:
            prompt += (
                f"  - [{d.severity}] p{d.page + 1}: "
                f"{d.description}\n"
            )

    try:
        result = summary_agent.run_sync(prompt)
        summary = result.output
    except Exception:
        logger.warning(
            "[ledger] summary generation failed, using fallback",
            exc_info=True,
        )
        summary = _fallback_summary(
            error_count, warning_count,
            pages_examined, unauditable_pages,
        )

    if slog:
        slog.response("summary", body={"summary": summary})

    return summary


def _fallback_summary(
    error_count: int,
    warning_count: int,
    pages_examined: list[int],
    unauditable_pages: list[int],
) -> str:
    """Deterministic fallback if the summary model fails."""
    parts = []
    if error_count == 0 and warning_count == 0:
        parts.append(f"No mathematical errors found across {len(pages_examined)} pages.")
    else:
        if error_count:
            parts.append(f"Found {error_count} error{'s' if error_count != 1 else ''}.")
        if warning_count:
            parts.append(f"Found {warning_count} warning{'s' if warning_count != 1 else ''}.")
    if unauditable_pages:
        parts.append(
            f"Pages {', '.join(str(p + 1) for p in unauditable_pages)} "
            "could not be audited (OCR unavailable)."
        )
    return " ".join(parts)


# ---------------------------------------------------------------------------
# LedgerAuditor — deterministic-first, LLM-lite audit pipeline
# ---------------------------------------------------------------------------

def audit(evidence: Evidence, tolerance: Decimal = Decimal("0.01")) -> Verdict:
    """
    Audit the evidence using a deterministic-first pipeline:

    1. Run TallyChecker + ArithmeticScanner on every folio (no LLM, instant)
    2. Extract named figures per-page with fast model (parallel)
    3. Run FigureTracker cross-page consistency check (no LLM)
    4. Generate human summary with fast model (one small call)
    5. Assemble Verdict

    This replaces the previous single-smart-model approach. Benefits:
    - Scales linearly with page count (no single giant prompt)
    - Uses fast model only where LLM is actually needed
    - Deterministic validators run instantly regardless of document size
    """
    slog = SessionLogger(evidence.session_id)
    logger.info(
        "[ledger] session=%s round=%d auditing %d folios (final=%s)",
        evidence.session_id,
        evidence.round,
        len(evidence.folios),
        evidence.final_round,
    )

    all_discrepancies: list[Discrepancy] = []
    pages_examined: list[int] = []
    figure_tracker = FigureTracker(tolerance=tolerance)

    # ------------------------------------------------------------------
    # Step 1: Deterministic validation — instant, no LLM
    # ------------------------------------------------------------------
    tally_checker = TallyChecker(tolerance=tolerance)
    arithmetic_scanner = ArithmeticScanner(tolerance=tolerance)

    for folio in evidence.folios:
        pages_examined.append(folio.page)

        # Check tables
        if folio.tables:
            for table_csv in folio.tables:
                results = tally_checker.check(folio.page, table_csv)
                all_discrepancies.extend(results)
                if slog:
                    slog.tool_call("check_tally", args={
                        "page": folio.page,
                        "table_csv": table_csv[:200],
                    }, result=[d.model_dump() for d in results])

        # Check inline arithmetic
        text = folio.readable_text
        if text and text.strip():
            results = arithmetic_scanner.scan(folio.page, text)
            all_discrepancies.extend(results)
            if slog:
                slog.tool_call("scan_arithmetic", args={
                    "page": folio.page,
                    "text_length": len(text),
                }, result=[d.model_dump() for d in results])

    logger.info(
        "[ledger] session=%s deterministic pass: %d discrepancies from %d pages",
        evidence.session_id,
        len(all_discrepancies),
        len(pages_examined),
    )

    # ------------------------------------------------------------------
    # Step 2: Figure extraction — fast model, per-page
    # ------------------------------------------------------------------
    folios_with_text = [
        f for f in evidence.folios if f.readable_text.strip()
    ]
    logger.info(
        "[ledger] session=%s step 2: extracting figures from %d pages",
        evidence.session_id,
        len(folios_with_text),
    )

    for folio in folios_with_text:
        for fig, page in _extract_figures_for_page(folio, slog):
            figure_tracker.record(
                label=fig.label,
                value=Decimal(
                    fig.value.replace(",", "").strip()
                ),
                page=page,
                raw=fig.raw,
            )

    logger.info(
        "[ledger] session=%s step 2 complete: %d figures registered",
        evidence.session_id,
        figure_tracker.entry_count,
    )

    # ------------------------------------------------------------------
    # Step 3: Cross-page consistency — deterministic
    # ------------------------------------------------------------------
    consistency_discrepancies = figure_tracker.conflicts()
    all_discrepancies.extend(consistency_discrepancies)
    if slog and consistency_discrepancies:
        slog.tool_call("check_figure_consistency",
                        result=[d.model_dump() for d in consistency_discrepancies])

    # ------------------------------------------------------------------
    # Step 4: Summary — fast model, small payload
    # ------------------------------------------------------------------
    logger.info(
        "[ledger] session=%s step 4: generating summary (%d discrepancies)",
        evidence.session_id,
        len(all_discrepancies),
    )
    pages_examined.sort()
    summary = _generate_summary(
        all_discrepancies, pages_examined, evidence.unauditable_pages, slog,
    )

    # ------------------------------------------------------------------
    # Step 5: Assemble Verdict
    # ------------------------------------------------------------------
    error_count = sum(1 for d in all_discrepancies if d.severity == "error")
    verdict = Verdict(
        session_id=evidence.session_id,
        discrepancies=all_discrepancies,
        pages_examined=pages_examined,
        rounds_taken=evidence.round,
        summary=summary,
        clean=error_count == 0,
        unauditable_pages=evidence.unauditable_pages,
    )

    slog.response("deliberate", body=verdict.model_dump())
    logger.info(
        "[ledger] session=%s verdict: %d errors, %d warnings, clean=%s",
        evidence.session_id,
        verdict.error_count,
        verdict.warning_count,
        verdict.clean,
    )
    slog.close()
    return verdict
