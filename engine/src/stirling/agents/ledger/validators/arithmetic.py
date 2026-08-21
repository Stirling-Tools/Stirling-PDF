"""
ArithmeticScanner — finds and verifies inline arithmetic expressions in text.

Targets patterns commonly found in financial documents:
  "100 + 200 + 150 = 450"
  "Total: 1,250 (500 + 400 + 350)"
  "Net profit of £1,200 (£2,000 revenue less £800 costs)"

All arithmetic is performed in Decimal. The scanner does not use an LLM —
it is a deterministic regex-and-eval pipeline.
"""

from __future__ import annotations

import logging
import re
from decimal import Decimal

from stirling.contracts.ledger import Discrepancy, DiscrepancyKind, Severity

from ._parsing import STRIP_PATTERN as _STRIP
from ._parsing import to_decimal as _to_decimal

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------

# Currency / number token: optional sign, optional currency symbol,
# digits with optional thousands separator and decimal point.
_NUM = r"[£$€¥]?-?[\d,]+(?:\.\d+)?"

# "A + B + C = D" or "A + B + C = D" with arbitrary spacing
_EQUALS_EXPR = re.compile(
    rf"({_NUM}(?:\s*[+\-]\s*{_NUM})+)\s*=\s*({_NUM})",
    re.IGNORECASE,
)

# "Total: X (A + B + C)" — the total comes before the addends
_TOTAL_THEN_ADDENDS = re.compile(
    rf"(?:total|sum|grand total|subtotal)\s*[:\-]?\s*({_NUM})\s*\(({_NUM}(?:\s*[+\-]\s*{_NUM})+)\)",
    re.IGNORECASE,
)


def _parse(token: str) -> Decimal | None:
    """Parse a regex-matched token to Decimal."""
    return _to_decimal(token)


def _eval_expression(expr: str) -> Decimal | None:
    """
    Evaluate a simple additive expression of the form  A +/- B +/- C ...
    Returns None if the expression cannot be parsed.
    """
    # Tokenise: split on + or -, keep the operator.
    tokens = re.split(r"([+\-])", _STRIP.sub("", expr.strip()))
    result = Decimal(0)
    operator = "+"
    for token in tokens:
        token = token.strip()
        if not token:
            continue  # skip empty tokens (e.g. from leading negative)
        if token in ("+", "-"):
            operator = token
            continue
        val = _parse(token)
        if val is None:
            return None
        result = result + val if operator == "+" else result - val
    return result


class ArithmeticScanner:
    """
    Scans a block of text for arithmetic expressions and checks them.

    Parameters
    ----------
    tolerance:
        Maximum absolute difference before an expression is flagged as wrong.
    """

    def __init__(self, tolerance: Decimal = Decimal("0.01")) -> None:
        self.tolerance = tolerance

    def scan(self, page: int, text: str) -> list[Discrepancy]:
        """
        Find all verifiable arithmetic expressions in *text* and return
        a Discrepancy for each one that does not balance within tolerance.
        """
        discrepancies: list[Discrepancy] = []
        discrepancies.extend(self._check_equals_expressions(page, text))
        discrepancies.extend(self._check_total_then_addends(page, text))
        return discrepancies

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _check_equals_expressions(self, page: int, text: str) -> list[Discrepancy]:
        """Handle patterns like '100 + 200 = 300'."""
        found: list[Discrepancy] = []
        for match in _EQUALS_EXPR.finditer(text):
            expr_str = match.group(1)
            stated_str = match.group(2)

            computed = _eval_expression(expr_str)
            stated = _parse(stated_str)
            if computed is None or stated is None:
                continue

            if abs(computed - stated) > self.tolerance:
                found.append(
                    Discrepancy(
                        page=page,
                        kind=DiscrepancyKind.ARITHMETIC,
                        severity=Severity.ERROR,
                        description=f"Arithmetic error: {expr_str.strip()} should equal {computed}, not {stated}",
                        stated=str(stated),
                        expected=str(computed),
                        context=match.group(0),
                    )
                )
        return found

    def _check_total_then_addends(self, page: int, text: str) -> list[Discrepancy]:
        """Handle patterns like 'Total: 450 (100 + 200 + 150)'."""
        found: list[Discrepancy] = []
        for match in _TOTAL_THEN_ADDENDS.finditer(text):
            stated_str = match.group(1)
            expr_str = match.group(2)

            stated = _parse(stated_str)
            computed = _eval_expression(expr_str)
            if stated is None or computed is None:
                continue

            if abs(computed - stated) > self.tolerance:
                found.append(
                    Discrepancy(
                        page=page,
                        kind=DiscrepancyKind.ARITHMETIC,
                        severity=Severity.ERROR,
                        description=f"Stated total {stated} does not match addends ({expr_str.strip()} = {computed})",
                        stated=str(stated),
                        expected=str(computed),
                        context=match.group(0),
                    )
                )
        return found
