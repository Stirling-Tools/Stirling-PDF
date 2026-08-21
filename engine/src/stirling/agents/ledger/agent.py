"""
Math Auditor Agent (mathAuditorAgent) — pydantic-ai agents for PDF math validation.

Examiner  (Round 1, /api/v1/ai/math-auditor-agent/examine)
    Receives a FolioManifest and returns a Requisition declaring what
    Java must extract before validation can begin.

Audit pipeline  (Round 2, /api/v1/ai/math-auditor-agent/deliberate)
    Processes Evidence per-page:
      1. Deterministic pass — ArithmeticScanner on every folio
      2. Fast-model pass  — extract named figures from each page
      3. FigureTracker    — cross-page consistency check
      4. Fast-model call  — generate human-readable summary
      5. Assemble Verdict programmatically

Neither agent ever touches a PDF file. All content arrives pre-extracted
by Java, which owns the PDF from start to finish.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Coroutine
from decimal import Decimal, InvalidOperation
from typing import Any

from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.exceptions import AgentRunError

from stirling.contracts.ledger import (
    Discrepancy,
    DiscrepancyKind,
    Evidence,
    Folio,
    FolioManifest,
    Requisition,
    Severity,
    Verdict,
)
from stirling.logging import Pretty
from stirling.services import AppRuntime

from .prompts import (
    EXAMINER_SYSTEM_PROMPT,
    FIGURE_EXTRACTOR_PROMPT,
    STATEMENT_VERIFIER_PROMPT,
    SUMMARY_PROMPT,
    TABLE_FORMULA_PROMPT,
)
from .validators import ArithmeticScanner, FigureTracker, FormulaEvaluator

logger = logging.getLogger(__name__)


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


class FormulaCheck(BaseModel):
    """One verifiable mathematical relationship in a table."""

    description: str = Field(description="Human-readable, e.g. 'Line Total = Qty × Unit Price'")
    formula: str = Field(description="Expression: 'col3 = col1 * col2' or 'cell(4,3) = sum(col3, 1-3)'")
    scope: str = Field(description="'each_row' | 'column_total' | 'single_cell'")
    row_range: list[int] | None = Field(default=None, description="Data rows to check (for each_row scope)")
    target_row: int | None = Field(default=None, description="Row index of total (for column_total/single_cell)")
    target_col: int | None = Field(default=None, description="Column index (for column_total/single_cell)")


class TableFormulas(BaseModel):
    """All verifiable formulas found in one table."""

    formulas: list[FormulaCheck] = Field(default_factory=list)


class StatementCheck(BaseModel):
    """One prose claim and its verification result."""

    claim: str = Field(description="The exact text of the claim")
    verification: str = Field(description="Type: percentage_change, comparison, ratio, trend, average, other")
    values_referenced: list[str] = Field(default_factory=list, description="Numbers used in the check")
    expected_result: str = Field(description="What the calculation actually yields")
    actual_claim: str = Field(description="What the text claims")
    is_valid: bool = Field(description="True if the claim is correct within tolerance")
    explanation: str = Field(description="One-line working showing the calculation")


class StatementsResult(BaseModel):
    """All verifiable prose claims found on a page."""

    statements: list[StatementCheck] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# MathAuditorAgent — main entry point, instantiated once at startup
# ---------------------------------------------------------------------------


class MathAuditorAgent:
    """
    Encapsulates the Ledger Auditor pipeline.

    Instantiated once at app startup with an AppRuntime, which provides
    pre-built Model objects and ModelSettings.
    """

    def __init__(self, runtime: AppRuntime) -> None:
        fast_model = runtime.fast_model
        model_settings = runtime.fast_model_settings
        self._runtime = runtime
        self._examiner = Agent(
            model=fast_model,
            deps_type=FolioManifest,
            output_type=Requisition,
            system_prompt=EXAMINER_SYSTEM_PROMPT,
            model_settings=model_settings,
        )
        self._figure_extractor = Agent(
            model=fast_model,
            output_type=FigureExtractionResult,
            system_prompt=FIGURE_EXTRACTOR_PROMPT,
            model_settings=model_settings,
        )
        self._table_analyser = Agent(
            model=fast_model,
            output_type=TableFormulas,
            system_prompt=TABLE_FORMULA_PROMPT,
            model_settings=model_settings,
        )
        self._statement_verifier = Agent(
            model=fast_model,
            output_type=StatementsResult,
            system_prompt=STATEMENT_VERIFIER_PROMPT,
            model_settings=model_settings,
        )
        self._summary_agent = Agent(
            model=fast_model,
            output_type=str,
            system_prompt=SUMMARY_PROMPT,
            model_settings=model_settings,
        )
        self._llm_semaphore = asyncio.Semaphore(10)

    # ------------------------------------------------------------------
    # Round 1: Examine
    # ------------------------------------------------------------------

    async def examine(self, manifest: FolioManifest) -> Requisition:
        """Inspect a FolioManifest and declare the Requisition."""
        logger.info(
            "[math-auditor-agent] session=%s round=%d examining %d folios",
            manifest.session_id,
            manifest.round,
            manifest.page_count,
        )

        user_prompt = "Examine this folio manifest and declare your requisition:\n" + manifest.model_dump_json()
        logger.debug("REQUEST (examine)\n%s", Pretty({"user_prompt": user_prompt}))

        result = await self._examiner.run(user_prompt, deps=manifest)
        req = result.output

        logger.debug("RESPONSE (examine)\n%s", Pretty(req.model_dump()))
        logger.info(
            "[math-auditor-agent] session=%s requisition: text=%s tables=%s ocr=%s",
            manifest.session_id,
            req.need_text,
            req.need_tables,
            req.need_ocr,
        )
        return req

    # ------------------------------------------------------------------
    # Round 2: Deliberate (deterministic-first pipeline)
    # ------------------------------------------------------------------

    async def audit(self, evidence: Evidence, tolerance: Decimal = Decimal("0.01")) -> Verdict:
        """
        Audit the evidence using a deterministic-first pipeline:

        1. Run ArithmeticScanner on every folio (no LLM)
        2. Extract named figures per-page with fast model
        3. Run FigureTracker cross-page consistency check (no LLM)
        4. Generate human summary with fast model
        5. Assemble Verdict
        """
        return await self._audit_inner(evidence, tolerance)

    async def _audit_inner(
        self,
        evidence: Evidence,
        tolerance: Decimal,
    ) -> Verdict:
        logger.info(
            "[math-auditor-agent] session=%s round=%d auditing %d folios (final=%s)",
            evidence.session_id,
            evidence.round,
            len(evidence.folios),
            evidence.final_round,
        )

        all_discrepancies: list[Discrepancy] = []
        pages_examined: list[int] = []
        figure_tracker = FigureTracker(tolerance=tolerance)

        # Step 1: Arithmetic scanning (deterministic, instant)
        arithmetic_scanner = ArithmeticScanner(tolerance=tolerance)
        for folio in evidence.folios:
            pages_examined.append(folio.page)
            text = folio.readable_text
            if text and text.strip():
                results = arithmetic_scanner.scan(folio.page, text)
                all_discrepancies.extend(results)
                logger.debug(
                    "TOOL (scan_arithmetic)\nArgs: %s\nResult: %s",
                    Pretty({"page": folio.page, "text_length": len(text)}),
                    Pretty([d.model_dump() for d in results]),
                )

        # Step 2: Parallel LLM calls — formula inference + figure extraction
        # These are independent per-page so we fire them all concurrently.
        formula_evaluator = FormulaEvaluator(tolerance=tolerance)
        folios_with_text = [f for f in evidence.folios if f.readable_text.strip()]

        # Collect all tables as (page, csv) pairs for formula inference
        table_tasks: list[tuple[int, str]] = []
        for folio in evidence.folios:
            if folio.tables:
                for table_csv in folio.tables:
                    table_tasks.append((folio.page, table_csv))

        logger.info(
            "[math-auditor-agent] session=%s step 2: %d formula + %d figure LLM calls (parallel)",
            evidence.session_id,
            len(table_tasks),
            len(folios_with_text),
        )

        # Fire all LLM calls concurrently (bounded by _llm_semaphore)
        formula_coros = [self._throttled(self._infer_formulas(csv)) for _, csv in table_tasks]
        figure_coros = [self._throttled(self._extract_figures_for_page(f)) for f in folios_with_text]
        statement_coros = [self._throttled(self._verify_statements(f)) for f in folios_with_text]
        all_results = await asyncio.gather(
            *formula_coros,
            *figure_coros,
            *statement_coros,
            return_exceptions=True,
        )

        n_formulas = len(table_tasks)
        n_figures = len(folios_with_text)

        # Process formula results
        for i, (page, table_csv) in enumerate(table_tasks):
            result = all_results[i]
            if isinstance(result, BaseException):
                logger.warning("[math-auditor-agent] formula inference failed for page %d: %s", page, result)
                continue
            assert isinstance(result, TableFormulas)
            formulas = result
            if not formulas.formulas:
                logger.info("[math-auditor-agent] page %d: no verifiable formulas found", page)
                continue
            for fc in formulas.formulas:
                checked = formula_evaluator.evaluate(
                    page=page,
                    table_csv=table_csv,
                    formula=fc.formula,
                    scope=fc.scope,
                    description=fc.description,
                    row_range=fc.row_range,
                    target_row=fc.target_row,
                    target_col=fc.target_col,
                )
                all_discrepancies.extend(checked)
                logger.debug(
                    "TOOL (check_formula)\nArgs: %s\nResult: %s",
                    Pretty({"page": page, "formula": fc.formula, "scope": fc.scope, "description": fc.description}),
                    Pretty([d.model_dump() for d in checked]),
                )

        # Process figure results
        for i, folio in enumerate(folios_with_text):
            result = all_results[n_formulas + i]
            if isinstance(result, BaseException):
                logger.warning("[math-auditor-agent] figure extraction failed for page %d: %s", folio.page, result)
                continue
            assert isinstance(result, list)
            for fig, page in result:
                try:
                    decimal_value = Decimal(fig.value.replace(",", "").strip())
                except (InvalidOperation, ValueError):
                    logger.warning(
                        "[math-auditor-agent] skipping figure %r on page %d: non-numeric value %r",
                        fig.label,
                        page,
                        fig.value,
                    )
                    continue
                figure_tracker.record(
                    label=fig.label,
                    value=decimal_value,
                    page=page,
                    raw=fig.raw,
                )

        # Process statement verification results
        for i, folio in enumerate(folios_with_text):
            result = all_results[n_formulas + n_figures + i]
            if isinstance(result, BaseException):
                logger.warning("[math-auditor-agent] statement verification failed for page %d: %s", folio.page, result)
                continue
            assert isinstance(result, StatementsResult)
            stmts = result
            for sc in stmts.statements:
                if not sc.is_valid:
                    all_discrepancies.append(
                        Discrepancy(
                            page=folio.page,
                            kind=DiscrepancyKind.STATEMENT,
                            severity=Severity.ERROR,
                            description=f"{sc.claim}: {sc.explanation}",
                            stated=sc.actual_claim,
                            expected=sc.expected_result,
                            context=sc.claim,
                        )
                    )
                logger.debug(
                    "TOOL (verify_statement)\nArgs: %s\nResult: %s",
                    Pretty({"page": folio.page, "claim": sc.claim}),
                    Pretty(sc.model_dump()),
                )

        logger.info(
            "[math-auditor-agent] session=%s step 2 complete: %d figures registered",
            evidence.session_id,
            figure_tracker.entry_count,
        )

        # Step 3: Cross-page consistency — deterministic
        consistency_discrepancies = figure_tracker.conflicts()
        all_discrepancies.extend(consistency_discrepancies)
        if consistency_discrepancies:
            logger.debug(
                "TOOL (check_figure_consistency)\nResult: %s",
                Pretty([d.model_dump() for d in consistency_discrepancies]),
            )

        # Step 4: Summary — fast model, small payload
        # Collect verification stats for the summary
        total_tables = sum(len(f.tables) for f in evidence.folios if f.tables)
        total_formulas_checked = sum(len(r.formulas) for r in all_results[:n_formulas] if isinstance(r, TableFormulas))
        total_statements_checked = sum(
            len(r.statements) for r in all_results[n_formulas + n_figures :] if isinstance(r, StatementsResult)
        )
        verification_stats = (
            f"Verified: {len(pages_examined)} pages, {total_tables} tables "
            f"({total_formulas_checked} formulas), "
            f"{figure_tracker.entry_count} figures tracked, "
            f"{total_statements_checked} prose claims checked."
        )

        logger.info(
            "[math-auditor-agent] session=%s step 4: generating summary (%d discrepancies)",
            evidence.session_id,
            len(all_discrepancies),
        )
        pages_examined.sort()
        summary = await self._generate_summary(
            all_discrepancies,
            pages_examined,
            evidence.unauditable_pages,
            verification_stats,
        )

        # Step 5: Assemble Verdict
        error_count = sum(1 for d in all_discrepancies if d.severity == Severity.ERROR)
        verdict = Verdict(
            session_id=evidence.session_id,
            discrepancies=all_discrepancies,
            pages_examined=pages_examined,
            rounds_taken=evidence.round,
            summary=summary,
            clean=error_count == 0,
            unauditable_pages=evidence.unauditable_pages,
        )

        logger.debug("RESPONSE (deliberate)\n%s", Pretty(verdict.model_dump()))
        logger.info(
            "[math-auditor-agent] session=%s verdict: %d errors, %d warnings, clean=%s",
            evidence.session_id,
            verdict.error_count,
            verdict.warning_count,
            verdict.clean,
        )
        return verdict

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _throttled[T](self, coro: Coroutine[Any, Any, T]) -> T:
        """Wrap a coroutine with the LLM concurrency semaphore."""
        async with self._llm_semaphore:
            return await coro

    async def _infer_formulas(self, table_csv: str) -> TableFormulas:
        """Ask the fast model to infer verifiable formulas from a CSV table."""
        try:
            result = await self._table_analyser.run(f"CSV table:\n{table_csv}")
            formulas = result.output
        except AgentRunError:
            logger.warning("[math-auditor-agent] formula inference failed, skipping table", exc_info=True)
            formulas = TableFormulas(formulas=[])

        logger.debug(
            "TOOL (infer_formulas)\nArgs: %s\nResult: %s",
            Pretty({"table_csv": table_csv[:300]}),
            Pretty(formulas.model_dump()),
        )
        return formulas

    async def _verify_statements(
        self,
        folio: Folio,
    ) -> StatementsResult:
        """Ask the fast model to find and verify prose claims on a page."""
        text = folio.readable_text
        if not text or not text.strip():
            return StatementsResult(statements=[])

        # Build context: page text + any table CSVs
        prompt = f"Page {folio.page + 1} text:\n{text}"
        if folio.tables:
            prompt += "\n\nTable data on this page:\n"
            for i, csv in enumerate(folio.tables):
                prompt += f"\nTable {i + 1}:\n{csv}"

        try:
            result = await self._statement_verifier.run(prompt)
            stmts = result.output
        except AgentRunError:
            logger.warning("[math-auditor-agent] statement verification failed for page %d", folio.page, exc_info=True)
            stmts = StatementsResult(statements=[])

        if stmts.statements:
            logger.debug(
                "TOOL (verify_statements)\nArgs: %s\nResult: %s",
                Pretty({"page": folio.page, "text_length": len(text), "n_tables": len(folio.tables or [])}),
                Pretty([s.model_dump() for s in stmts.statements]),
            )
        return stmts

    async def _extract_figures_for_page(
        self,
        folio: Folio,
    ) -> list[tuple[ExtractedFigure, int]]:
        text = folio.readable_text
        if not text or not text.strip():
            return []

        logger.info("[math-auditor-agent] extracting figures from page %d (%d chars)", folio.page, len(text))
        prompt = f"Page {folio.page + 1} text:\n{text}"
        try:
            result = await self._figure_extractor.run(prompt)
            figures = result.output.figures
        except AgentRunError:
            logger.warning(
                "[math-auditor-agent] figure extraction failed for page %d, skipping",
                folio.page,
                exc_info=True,
            )
            figures = []

        logger.debug(
            "TOOL (extract_figures)\nArgs: %s\nResult: %s",
            Pretty({"page": folio.page, "text_length": len(text)}),
            Pretty([f.model_dump() for f in figures]),
        )

        return [(fig, folio.page) for fig in figures]

    async def _generate_summary(
        self,
        discrepancies: list[Discrepancy],
        pages_examined: list[int],
        unauditable_pages: list[int],
        verification_stats: str,
    ) -> str:
        error_count = sum(1 for d in discrepancies if d.severity == Severity.ERROR)
        warning_count = sum(1 for d in discrepancies if d.severity == Severity.WARNING)

        prompt = (
            f"{verification_stats}\n"
            f"Errors: {error_count}, Warnings: {warning_count}, "
            f"Pages examined: {len(pages_examined)}, "
            f"Unauditable pages: {unauditable_pages or 'none'}.\n"
        )
        if discrepancies:
            prompt += "Discrepancies:\n"
            for d in discrepancies:
                prompt += f"  - [{d.severity}] p{d.page + 1}: {d.description}\n"

        try:
            result = await self._summary_agent.run(prompt)
            summary = result.output
        except AgentRunError:
            logger.warning("[math-auditor-agent] summary generation failed, using fallback", exc_info=True)
            summary = self._fallback_summary(error_count, warning_count, pages_examined, unauditable_pages)

        logger.debug("RESPONSE (summary)\n%s", Pretty({"summary": summary}))
        return summary

    @staticmethod
    def _fallback_summary(
        error_count: int,
        warning_count: int,
        pages_examined: list[int],
        unauditable_pages: list[int],
    ) -> str:
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
                f"Pages {', '.join(str(p + 1) for p in unauditable_pages)} could not be audited (OCR unavailable)."
            )
        return " ".join(parts)
