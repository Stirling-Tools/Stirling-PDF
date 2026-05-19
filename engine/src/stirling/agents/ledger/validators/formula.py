"""
FormulaEvaluator — verifies LLM-inferred formulas against CSV table data.

Supports a safe expression syntax:
  - Column refs:  col0, col1, col2 ...
  - Cell refs:    cell(row, col)
  - Operators:    +  -  *  /
  - Functions:    sum(colN, rows start-end)

All arithmetic is Decimal. No eval(), no arbitrary code execution.
"""

from __future__ import annotations

import logging
import re
from decimal import Decimal, InvalidOperation

from stirling.contracts.ledger import Discrepancy, DiscrepancyKind, Severity

from ._parsing import parse_csv as _parse_csv
from ._parsing import to_decimal as _to_decimal

logger = logging.getLogger(__name__)


class FormulaEvaluator:
    """
    Evaluates formula expressions against parsed CSV rows.

    Formulas use a simple syntax:
      "col3 = col1 * col2"           — per-row check
      "cell(4,3) = sum(col3, 1-3)"   — single cell check
    """

    def __init__(self, tolerance: Decimal = Decimal("0.01")) -> None:
        self.tolerance = tolerance

    def evaluate(
        self,
        page: int,
        table_csv: str,
        formula: str,
        scope: str,
        description: str,
        row_range: list[int] | None = None,
        target_row: int | None = None,
        target_col: int | None = None,
    ) -> list[Discrepancy]:
        """
        Evaluate a formula against table data.

        scope: "each_row" | "column_total" | "single_cell"
        """
        rows = _parse_csv(table_csv)
        if len(rows) < 2:
            return []

        if scope == "each_row":
            return self._check_each_row(page, rows, formula, description, row_range)
        elif scope == "column_total":
            return self._check_column_total(page, rows, formula, description, target_row, target_col)
        elif scope == "single_cell":
            return self._check_single_cell(page, rows, formula, description, target_row, target_col)
        else:
            logger.warning("[formula] unknown scope %r, skipping", scope)
            return []

    def _check_each_row(
        self,
        page: int,
        rows: list[list[str]],
        formula: str,
        description: str,
        row_range: list[int] | None,
    ) -> list[Discrepancy]:
        """Verify formula holds for each data row."""
        discrepancies: list[Discrepancy] = []

        # Parse "colX = expr" format
        parts = formula.split("=", 1)
        if len(parts) != 2:
            return []
        lhs = parts[0].strip()
        rhs = parts[1].strip()

        lhs_col = self._parse_col_ref(lhs)
        if lhs_col is None:
            return []

        check_rows = row_range if row_range else list(range(1, len(rows)))

        for row_idx in check_rows:
            if row_idx >= len(rows):
                continue
            row = rows[row_idx]

            stated = self._get_cell(row, lhs_col)
            if stated is None:
                continue

            computed = self._eval_row_expr(rhs, row, rows)
            if computed is None:
                continue

            if abs(stated - computed) > self.tolerance:
                discrepancies.append(
                    Discrepancy(
                        page=page,
                        kind=DiscrepancyKind.TALLY,
                        severity=Severity.ERROR,
                        description=f"{description}: row {row_idx} — stated {stated}, expected {computed}",
                        stated=str(stated),
                        expected=str(computed),
                        context=f"row {row_idx}, {formula}",
                    )
                )

        return discrepancies

    def _check_column_total(
        self,
        page: int,
        rows: list[list[str]],
        formula: str,
        description: str,
        target_row: int | None,
        target_col: int | None,
    ) -> list[Discrepancy]:
        """Verify that a total row contains correct column sums."""
        if target_row is None or target_row >= len(rows):
            return []

        discrepancies: list[Discrepancy] = []
        total_row = rows[target_row]

        # Determine which columns to check
        cols_to_check: list[int] = []
        if target_col is not None:
            cols_to_check = [target_col]
        else:
            # Check all numeric columns in the total row
            cols_to_check = list(range(len(total_row)))

        # Determine addend rows (all rows between header and total row)
        addend_rows = list(range(1, target_row))

        for col in cols_to_check:
            stated = self._get_cell(total_row, col)
            if stated is None:
                continue

            computed = Decimal(0)
            has_addends = False
            for r_idx in addend_rows:
                if r_idx >= len(rows):
                    continue
                val = self._get_cell(rows[r_idx], col)
                if val is not None:
                    computed += val
                    has_addends = True

            if not has_addends:
                continue

            if abs(stated - computed) > self.tolerance:
                discrepancies.append(
                    Discrepancy(
                        page=page,
                        kind=DiscrepancyKind.TALLY,
                        severity=Severity.ERROR,
                        description=f"{description}: column {col} — stated {stated}, expected {computed}",
                        stated=str(stated),
                        expected=str(computed),
                        context=f"column {col}, total row {target_row}",
                    )
                )

        return discrepancies

    def _check_single_cell(
        self,
        page: int,
        rows: list[list[str]],
        formula: str,
        description: str,
        target_row: int | None,
        target_col: int | None,
    ) -> list[Discrepancy]:
        """Verify a single cell formula (e.g. Grand Total = Subtotal + Tax)."""
        parts = formula.split("=", 1)
        if len(parts) != 2:
            return []

        # Parse target from LHS cell(r,c) if not provided explicitly
        if target_row is None or target_col is None:
            lhs_match = re.match(r"cell\(\s*(\d+)\s*,\s*(\d+)\s*\)", parts[0].strip())
            if lhs_match:
                target_row = int(lhs_match.group(1))
                target_col = int(lhs_match.group(2))
            else:
                return []

        if target_row >= len(rows):
            return []

        rhs = parts[1].strip()

        stated = self._get_cell(rows[target_row], target_col)
        if stated is None:
            return []

        computed = self._eval_row_expr(rhs, rows[target_row], rows)
        if computed is None:
            return []

        if abs(stated - computed) > self.tolerance:
            return [
                Discrepancy(
                    page=page,
                    kind=DiscrepancyKind.TALLY,
                    severity=Severity.ERROR,
                    description=f"{description}: stated {stated}, expected {computed}",
                    stated=str(stated),
                    expected=str(computed),
                    context=f"cell({target_row},{target_col}), {formula}",
                )
            ]
        return []

    # ------------------------------------------------------------------
    # Expression evaluation
    # ------------------------------------------------------------------

    def _eval_row_expr(self, expr: str, row: list[str], all_rows: list[list[str]]) -> Decimal | None:
        """
        Evaluate an expression in the context of a specific row.
        Supports: colN refs, cell(r,c) refs, +, -, *, /
        Also supports: sum(colN, start-end)
        """
        # Handle sum() function first
        sum_pattern = re.compile(r"sum\(\s*col(\d+)\s*,\s*(\d+)\s*-\s*(\d+)\s*\)")
        resolved = expr
        for match in sum_pattern.finditer(expr):
            col = int(match.group(1))
            start = int(match.group(2))
            end = int(match.group(3))
            total = Decimal(0)
            for r_idx in range(start, end + 1):
                if r_idx < len(all_rows):
                    val = self._get_cell(all_rows[r_idx], col)
                    if val is not None:
                        total += val
            resolved = resolved.replace(match.group(0), str(total))

        # Handle cell(r, c) references
        cell_pattern = re.compile(r"cell\(\s*(\d+)\s*,\s*(\d+)\s*\)")
        for match in cell_pattern.finditer(resolved):
            r = int(match.group(1))
            c = int(match.group(2))
            if r < len(all_rows):
                val = self._get_cell(all_rows[r], c)
                if val is not None:
                    resolved = resolved.replace(match.group(0), str(val))
                else:
                    return None
            else:
                return None

        # Replace colN references with values from the current row.
        # Use re.sub with word boundaries to avoid col1 corrupting col12.
        _failed = False

        def _col_replacer(m: re.Match[str]) -> str:
            nonlocal _failed
            col_idx = int(m.group(1))
            val = self._get_cell(row, col_idx)
            if val is None:
                _failed = True
                return m.group(0)
            return str(val)

        resolved = re.sub(r"\bcol(\d+)\b", _col_replacer, resolved)
        if _failed:
            return None

        # Evaluate the resulting arithmetic expression safely
        return self._safe_eval(resolved)

    def _safe_eval(self, expr: str) -> Decimal | None:
        """
        Evaluate a simple arithmetic expression containing only
        numbers and +, -, *, / operators.  Respects standard operator
        precedence (* and / bind tighter than + and -).  No eval().
        """
        try:
            raw = re.findall(r"\d+(?:\.\d+)?|[+\-*/]", expr.strip())
            if not raw:
                return None

            # Build (values, ops) lists, merging a leading '-' or an
            # operator-adjacent '-' into the next number token.
            values: list[Decimal] = []
            ops: list[str] = []
            i = 0
            while i < len(raw):
                tok = raw[i]
                if tok in "+-*/" and not values and tok == "-":
                    # Leading negative: merge with next number
                    i += 1
                    if i >= len(raw):
                        return None
                    values.append(Decimal("-" + raw[i]))
                elif tok in "+-*/":
                    # Operator followed by '-' → negative operand
                    if (
                        tok in "+-*/"
                        and i + 1 < len(raw)
                        and raw[i + 1] == "-"
                        and i + 2 < len(raw)
                        and raw[i + 2] not in "+-*/"
                    ):
                        ops.append(tok)
                        values.append(Decimal("-" + raw[i + 2]))
                        i += 2  # skip the '-' and the number
                    else:
                        ops.append(tok)
                else:
                    values.append(Decimal(tok))
                i += 1

            if not values:
                return None

            # Pass 1: evaluate * and /
            j = 0
            while j < len(ops):
                if ops[j] in ("*", "/"):
                    if ops[j] == "*":
                        values[j] = values[j] * values[j + 1]
                    else:
                        if values[j + 1] == 0:
                            return None
                        values[j] = values[j] / values[j + 1]
                    values.pop(j + 1)
                    ops.pop(j)
                else:
                    j += 1

            # Pass 2: evaluate + and -
            result = values[0]
            for j, op in enumerate(ops):
                if op == "+":
                    result += values[j + 1]
                elif op == "-":
                    result -= values[j + 1]

            return result
        except (InvalidOperation, IndexError, ValueError):
            return None

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_col_ref(ref: str) -> int | None:
        match = re.match(r"col(\d+)", ref.strip())
        return int(match.group(1)) if match else None

    @staticmethod
    def _get_cell(row: list[str], col: int) -> Decimal | None:
        if col >= len(row):
            return None
        return _to_decimal(row[col])
