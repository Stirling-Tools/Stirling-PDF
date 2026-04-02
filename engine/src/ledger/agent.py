"""
Ledger Auditor — the two pydantic-ai agents.

LedgerExaminer  (Round 1, /api/ledger/examine)
    Receives a FolioManifest and returns a Requisition declaring what
    Java must extract before validation can begin.

LedgerAuditor   (Round 2, /api/ledger/deliberate)
    Receives Evidence (folios with text, tables, OCR) and uses its tool
    suite to validate every figure it can find, then returns a Verdict.

Protocol note:
    The Auditor always returns a Verdict — it works with whatever evidence
    Java provides. If evidence for a page is absent (e.g. OCR not wired yet),
    that page is listed in Verdict.unauditable_pages so the caller knows
    coverage was incomplete. A further Requisition from the Auditor is not
    needed: the Examiner handles all dependency declaration up front.

Neither agent ever touches a PDF file. All content arrives pre-extracted
by Java, which owns the PDF from start to finish.
"""

from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation
from typing import Final

from pydantic_ai import Agent, RunContext

from ai_logging import SessionLogger
from config import FAST_MODEL, SMART_MODEL, get_pydantic_ai_model_id
from .deps import AuditContext
from .models import Discrepancy, Evidence, FolioManifest, Requisition, Verdict
from .prompts import AUDITOR_SYSTEM_PROMPT, EXAMINER_SYSTEM_PROMPT
from .validators import ArithmeticScanner, TallyChecker

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
# LedgerAuditor — Round 2: validate the evidence, render a verdict
# ---------------------------------------------------------------------------

ledger_auditor: Final[Agent[AuditContext, Verdict]] = Agent(
    model=get_pydantic_ai_model_id(SMART_MODEL),
    deps_type=AuditContext,
    output_type=Verdict,
    system_prompt=AUDITOR_SYSTEM_PROMPT,
)


@ledger_auditor.tool
def check_tally(
    ctx: RunContext[AuditContext],
    page: int,
    table_csv: str,
    total_row_index: int | None = None,
    total_col_index: int | None = None,
) -> list[Discrepancy]:
    """
    Verify that row and column totals in a CSV table balance arithmetically.
    Returns a list of Discrepancy objects (empty if the table is clean).

    page            — 0-indexed page number
    table_csv       — Tabula CSV string for one table
    total_row_index — which row holds column totals (None = heuristic: last row)
    total_col_index — which column holds row totals (None = heuristic: last column)
    """
    checker = TallyChecker(tolerance=ctx.deps.tolerance)
    result = checker.check(page, table_csv, total_row_index, total_col_index)
    if ctx.deps.slog:
        ctx.deps.slog.tool_call("check_tally", args={
            "page": page, "table_csv": table_csv,
            "total_row_index": total_row_index,
            "total_col_index": total_col_index,
        }, result=[d.model_dump() for d in result])
    return result


@ledger_auditor.tool
def scan_arithmetic(
    ctx: RunContext[AuditContext],
    page: int,
    text: str,
) -> list[Discrepancy]:
    """
    Find and verify inline arithmetic expressions in a block of text.
    Checks patterns like '100 + 200 = 300' and 'Total: 450 (200 + 150 + 100)'.
    Returns a list of Discrepancy objects (empty if all arithmetic is correct).

    page — 0-indexed page number
    text — the plain-text content of the folio (or a relevant excerpt)
    """
    scanner = ArithmeticScanner(tolerance=ctx.deps.tolerance)
    result = scanner.scan(page, text)
    if ctx.deps.slog:
        ctx.deps.slog.tool_call("scan_arithmetic", args={
            "page": page, "text": text[:200],
        }, result=[d.model_dump() for d in result])
    return result


@ledger_auditor.tool
def register_figure(
    ctx: RunContext[AuditContext],
    label: str,
    value_str: str,
    page: int,
    raw: str,
) -> str:
    """
    Register a named numeric figure for cross-page consistency checking.
    Call this for every significant named figure you encounter
    (e.g. "Total Revenue", "Net Profit", "VAT").

    label     — normalised human-readable name of the figure
    value_str — the numeric value as a string (e.g. "1200.00")
    page      — 0-indexed page number where this figure appears
    raw       — the original text from the document (e.g. "£1,200.00")

    Returns "recorded" on success or an error message.
    """
    try:
        value = Decimal(value_str.replace(",", "").strip())
    except InvalidOperation:
        msg = f"Could not parse '{value_str}' as a number — figure not recorded."
        if ctx.deps.slog:
            ctx.deps.slog.tool_call("register_figure", args={
                "label": label, "value_str": value_str, "page": page, "raw": raw,
            }, result=msg)
        return msg

    ctx.deps.figure_registry.record(label=label, value=value, page=page, raw=raw)
    if ctx.deps.slog:
        ctx.deps.slog.tool_call("register_figure", args={
            "label": label, "value_str": value_str, "page": page, "raw": raw,
        }, result="recorded")
    return "recorded"


@ledger_auditor.tool
def check_figure_consistency(ctx: RunContext[AuditContext]) -> list[Discrepancy]:
    """
    Check all registered figures for cross-page consistency.
    Call this once after registering all figures you have encountered.
    Returns a Discrepancy for every figure that is cited with different
    values on different pages.
    """
    result = ctx.deps.figure_registry.conflicts()
    if ctx.deps.slog:
        ctx.deps.slog.tool_call("check_figure_consistency",
                                result=[d.model_dump() for d in result])
    return result


def audit(evidence: Evidence, tolerance: Decimal = Decimal("0.01")) -> Verdict:
    """
    Run the Auditor against a fulfilled Evidence payload.
    Returns the Verdict the Auditor renders after inspecting all folios.
    Synchronous — safe to call directly from a Flask route handler.

    If a folio was requested but not provided (e.g. OCR pages Java couldn't
    process), the Auditor notes those pages in Verdict.unauditable_pages.
    """
    slog = SessionLogger(evidence.session_id)
    context = AuditContext(evidence=evidence, tolerance=tolerance, slog=slog)

    folio_summary = "\n".join(
        f"  Page {f.page + 1}: "
        f"{'text ✓' if f.text else 'text ✗'} "
        f"{'tables ✓' if f.tables else ''} "
        f"{'OCR ✓' if f.ocr_text else ''}"
        for f in evidence.folios
    )

    prompt = (
        f"Audit this evidence. Session: {evidence.session_id}, "
        f"Round: {evidence.round}, Final: {evidence.final_round}.\n\n"
        f"Available folios:\n{folio_summary}\n\n"
        f"Folio content (JSON):\n{evidence.model_dump_json()}"
    )

    logger.info(
        "[ledger] session=%s round=%d auditing %d folios (final=%s)",
        evidence.session_id,
        evidence.round,
        len(evidence.folios),
        evidence.final_round,
    )

    slog.request("deliberate", body={
        "model": get_pydantic_ai_model_id(SMART_MODEL),
        "system_prompt": AUDITOR_SYSTEM_PROMPT,
        "user_prompt": prompt,
        "evidence": evidence.model_dump(),
    })

    result = ledger_auditor.run_sync(
        prompt,
        deps=context,
        model_settings={"timeout": 90.0},
    )
    verdict = result.output

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
