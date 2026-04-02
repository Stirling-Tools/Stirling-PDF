"""
TallyChecker — verifies that row and column totals in a CSV table balance.

The LLM tells TallyChecker which columns are totals and which are addends;
TallyChecker does the deterministic arithmetic and reports any gap that
exceeds the configured tolerance.

Design notes:
- All arithmetic is done in Decimal to avoid floating-point surprises.
- The checker is stateless; instantiate once and call check() many times.
- Non-numeric cells are skipped silently (e.g. header labels, N/A).
"""

from __future__ import annotations

import csv
import io
import logging
from decimal import Decimal

from ..models import Discrepancy, DiscrepancyKind, Severity, TallyError
from ._parsing import to_decimal as _to_decimal

logger = logging.getLogger(__name__)


class TallyChecker:
    """
    Parses a Tabula-produced CSV string and checks whether the stated totals
    in each column (and optionally each row) match the sum of their addends.

    Parameters
    ----------
    tolerance:
        Maximum absolute difference allowed before a mismatch is flagged.
        Defaults to 0.01 (one penny / one cent).
    """

    def __init__(self, tolerance: Decimal = Decimal("0.01")) -> None:
        self.tolerance = tolerance

    def check(
        self,
        page: int,
        table_csv: str,
        total_row_index: int | None = None,
        total_col_index: int | None = None,
    ) -> list[Discrepancy]:
        """
        Check a table for tally errors.

        Parameters
        ----------
        page:
            0-indexed page number (for error attribution only).
        table_csv:
            A Tabula CSV string — one row per line, comma-delimited.
        total_row_index:
            The row (0-indexed) that contains column totals, if any.
            When None, the checker heuristically tries the last non-empty row.
        total_col_index:
            The column (0-indexed) that contains row totals, if any.
            When None, the checker heuristically tries the last non-empty column.
        """
        rows = self._parse(table_csv)
        if len(rows) < 2:
            return []

        discrepancies: list[Discrepancy] = []
        errors: list[TallyError] = []
        # When no explicit indices are given, heuristically check column totals
        # using the last row as the assumed total row.
        if total_row_index is not None:
            errors += self._check_column_totals(rows, total_row_index)
        elif total_col_index is None:
            errors += self._check_column_totals(rows, len(rows) - 1)
        if total_col_index is not None:
            errors += self._check_row_totals(rows, total_col_index)

        for err in errors:
            discrepancies.append(
                Discrepancy(
                    page=page,
                    kind=DiscrepancyKind.TALLY,
                    severity=Severity.ERROR,
                    description=err.description,
                    stated=str(err.stated),
                    expected=str(err.computed),
                    context=err.location,
                )
            )
        return discrepancies

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _parse(self, table_csv: str) -> list[list[str]]:
        reader = csv.reader(io.StringIO(table_csv.strip()))
        return [row for row in reader if any(cell.strip() for cell in row)]

    def _check_column_totals(
        self, rows: list[list[str]], total_row_index: int | None
    ) -> list[TallyError]:
        """For each column, verify that addend rows sum to the total row."""
        if not rows:
            return []

        # Determine which row holds column totals.
        tidx = total_row_index if total_row_index is not None else len(rows) - 1
        if tidx >= len(rows):
            return []

        total_row = rows[tidx]
        addend_rows = rows[:tidx]  # everything above the total row

        errors: list[TallyError] = []
        col_count = max(len(r) for r in rows)

        for col in range(col_count):
            total_cell = total_row[col] if col < len(total_row) else ""
            stated = _to_decimal(total_cell)
            if stated is None:
                continue  # not a numeric total column

            computed = Decimal(0)
            for row in addend_rows:
                val = _to_decimal(row[col]) if col < len(row) else None
                if val is not None:
                    computed += val

            if abs(stated - computed) > self.tolerance:
                errors.append(
                    TallyError(
                        description=f"Column {col} total does not balance",
                        stated=stated,
                        computed=computed,
                        location=f"column {col}, total row {tidx}",
                    )
                )

        return errors

    def _check_row_totals(
        self, rows: list[list[str]], total_col_index: int | None
    ) -> list[TallyError]:
        """For each row, verify that addend columns sum to the total column."""
        if not rows:
            return []

        col_count = max(len(r) for r in rows)
        tidx = total_col_index if total_col_index is not None else col_count - 1

        errors: list[TallyError] = []
        for row_idx, row in enumerate(rows):
            stated_cell = row[tidx] if tidx < len(row) else ""
            stated = _to_decimal(stated_cell)
            if stated is None:
                continue

            computed = Decimal(0)
            for col, cell in enumerate(row):
                if col == tidx:
                    continue
                val = _to_decimal(cell)
                if val is not None:
                    computed += val

            if abs(stated - computed) > self.tolerance:
                errors.append(
                    TallyError(
                        description=f"Row {row_idx} total does not balance",
                        stated=stated,
                        computed=computed,
                        location=f"row {row_idx}, total column {tidx}",
                    )
                )

        return errors
