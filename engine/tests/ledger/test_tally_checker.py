"""
TallyChecker — unit tests.

Every test uses plain CSV strings; no PDF, no LLM, no network.
The checker is deterministic: given the same input it must always return the same result.
"""

from decimal import Decimal

import pytest

from ledger.validators.tally import TallyChecker


@pytest.fixture
def checker() -> TallyChecker:
    return TallyChecker(tolerance=Decimal("0.01"))


# ---------------------------------------------------------------------------
# Clean tables — should find zero discrepancies
# ---------------------------------------------------------------------------


def test_clean_column_totals(checker: TallyChecker) -> None:
    """A table whose column totals are correct should produce no findings."""
    csv = (
        "Item,Q1,Q2,Q3\n"
        "Alpha,100,200,150\n"
        "Beta,50,75,25\n"
        "Total,150,275,175\n"
    )
    assert checker.check(page=0, table_csv=csv) == []


def test_clean_with_currency_symbols(checker: TallyChecker) -> None:
    """Currency symbols and commas in cells must be stripped before arithmetic."""
    csv = (
        "Description,Amount\n"
        "Fee,£1,200.00\n"
        "Tax,£240.00\n"
        "Total,£1,440.00\n"
    )
    assert checker.check(page=0, table_csv=csv) == []


def test_single_row_table_skipped(checker: TallyChecker) -> None:
    """A table with only one row has nothing to sum; should return no findings."""
    csv = "Total,500\n"
    assert checker.check(page=0, table_csv=csv) == []


# ---------------------------------------------------------------------------
# Tally errors — must be detected
# ---------------------------------------------------------------------------


def test_column_total_wrong(checker: TallyChecker) -> None:
    """Column total does not match the sum of addends — must surface an error."""
    csv = (
        "Item,Amount\n"
        "Widget,100\n"
        "Gadget,200\n"
        "Total,250\n"  # should be 300
    )
    discrepancies = checker.check(page=2, table_csv=csv)
    assert len(discrepancies) == 1
    d = discrepancies[0]
    assert d.page == 2
    assert d.kind == "tally"
    assert d.severity == "error"
    assert d.stated == "250"
    assert d.expected == "300"


def test_row_total_wrong(checker: TallyChecker) -> None:
    """Row total column does not balance — must surface an error."""
    csv = (
        "Jan,Feb,Mar,Total\n"
        "10,20,30,55\n"  # should be 60
    )
    discrepancies = checker.check(page=0, table_csv=csv, total_col_index=3)
    assert len(discrepancies) == 1
    assert discrepancies[0].stated == "55"
    assert discrepancies[0].expected == "60"


def test_multiple_column_errors(checker: TallyChecker) -> None:
    """Multiple columns with wrong totals should each produce a discrepancy."""
    csv = (
        "A,B\n"
        "10,20\n"
        "30,40\n"
        "99,99\n"  # both wrong: A=40, B=60
    )
    discrepancies = checker.check(page=0, table_csv=csv)
    assert len(discrepancies) == 2


# ---------------------------------------------------------------------------
# Tolerance
# ---------------------------------------------------------------------------


def test_within_tolerance_not_flagged() -> None:
    """A rounding difference within tolerance must not be flagged."""
    checker = TallyChecker(tolerance=Decimal("0.05"))
    csv = (
        "Item,Amount\n"
        "A,33.33\n"
        "B,33.33\n"
        "C,33.33\n"
        "Total,99.99\n"  # 33.33 * 3 = 99.99, off by 0.00 — clean
    )
    assert checker.check(page=0, table_csv=csv) == []


def test_exceeds_tolerance_flagged() -> None:
    """A difference that exceeds tolerance must be flagged."""
    checker = TallyChecker(tolerance=Decimal("0.01"))
    csv = (
        "Item,Amount\n"
        "A,10\n"
        "B,10\n"
        "Total,21\n"  # off by 1
    )
    discrepancies = checker.check(page=0, table_csv=csv)
    assert len(discrepancies) == 1


# ---------------------------------------------------------------------------
# Parenthesised negatives
# ---------------------------------------------------------------------------


def test_parenthesised_negative_cells(checker: TallyChecker) -> None:
    """Cells like (123) should be treated as negative numbers in row totals."""
    # One data row only — no separate total row, so total_row_index is irrelevant.
    # total_col_index=2 (Net) is the row-total column.
    # Row total: 500 + (-200) = 300 ✓
    csv = "500,(200),300\n"
    discrepancies = checker.check(page=0, table_csv=csv, total_col_index=2)
    assert discrepancies == []


def test_parenthesised_negative_in_column_total(checker: TallyChecker) -> None:
    """Parenthesised negatives must parse correctly as column addends."""
    # Column: 500 + (-200) = 300; stated total is 300 ✓
    csv = (
        "Amount\n"
        "500\n"
        "(200)\n"
        "300\n"
    )
    discrepancies = checker.check(page=0, table_csv=csv)
    assert discrepancies == []
