"""
FormulaEvaluator — unit tests.

Tests cover:
  - Operator precedence (* / before + -)
  - Column reference replacement (colN with word boundaries)
  - Negative number handling
  - each_row, column_total, and single_cell scopes
"""

from decimal import Decimal

import pytest

from stirling.agents.ledger.validators.formula import FormulaEvaluator


@pytest.fixture
def evaluator() -> FormulaEvaluator:
    return FormulaEvaluator(tolerance=Decimal("0.01"))


# ---------------------------------------------------------------------------
# _safe_eval — operator precedence
# ---------------------------------------------------------------------------


def test_safe_eval_addition(evaluator: FormulaEvaluator) -> None:
    assert evaluator._safe_eval("2 + 3") == Decimal("5")


def test_safe_eval_multiplication_before_addition(evaluator: FormulaEvaluator) -> None:
    """2 + 3 * 4 should be 14, not 20."""
    assert evaluator._safe_eval("2 + 3 * 4") == Decimal("14")


def test_safe_eval_division_before_subtraction(evaluator: FormulaEvaluator) -> None:
    """10 - 6 / 2 should be 7, not 2."""
    assert evaluator._safe_eval("10 - 6 / 2") == Decimal("7")


def test_safe_eval_mixed_precedence(evaluator: FormulaEvaluator) -> None:
    """1 + 2 * 3 - 4 / 2 should be 1 + 6 - 2 = 5."""
    assert evaluator._safe_eval("1 + 2 * 3 - 4 / 2") == Decimal("5")


def test_safe_eval_all_multiplication(evaluator: FormulaEvaluator) -> None:
    assert evaluator._safe_eval("2 * 3 * 4") == Decimal("24")


def test_safe_eval_division_by_zero(evaluator: FormulaEvaluator) -> None:
    assert evaluator._safe_eval("10 / 0") is None


def test_safe_eval_negative_result(evaluator: FormulaEvaluator) -> None:
    assert evaluator._safe_eval("3 - 5") == Decimal("-2")


def test_safe_eval_leading_negative(evaluator: FormulaEvaluator) -> None:
    """Expressions starting with a negative number should work."""
    result = evaluator._safe_eval("-100 + 200")
    assert result == Decimal("100")


def test_safe_eval_empty(evaluator: FormulaEvaluator) -> None:
    assert evaluator._safe_eval("") is None


def test_safe_eval_single_number(evaluator: FormulaEvaluator) -> None:
    assert evaluator._safe_eval("42") == Decimal("42")


def test_safe_eval_decimal_numbers(evaluator: FormulaEvaluator) -> None:
    result = evaluator._safe_eval("1.5 * 2 + 0.5")
    assert result == Decimal("3.5")


# ---------------------------------------------------------------------------
# colN replacement — word boundary safety
# ---------------------------------------------------------------------------


def test_col1_does_not_corrupt_col12(evaluator: FormulaEvaluator) -> None:
    """col1 replacement must not alter col12."""
    csv = "a,b,c,d,e,f,g,h,i,j,k,l,m\n0,10,0,0,0,0,0,0,0,0,0,0,120\n"
    # col1=10, col12=120 → col12 - col1 should be 110
    result = evaluator.evaluate(
        page=0,
        table_csv=csv,
        formula="col0 = col12 - col1",
        scope="each_row",
        description="test",
    )
    # row 1: col0=0, expected=120-10=110 → discrepancy
    assert len(result) == 1
    assert result[0].expected == "110"


def test_col_replacement_adjacent_columns(evaluator: FormulaEvaluator) -> None:
    """col1 and col10 should both be replaced correctly."""
    csv = "a,b,c,d,e,f,g,h,i,j,k\n55,5,0,0,0,0,0,0,0,0,50\n"
    # col0=55, col1=5, col10=50 → col1 + col10 = 55
    result = evaluator.evaluate(
        page=0,
        table_csv=csv,
        formula="col0 = col1 + col10",
        scope="each_row",
        description="test",
    )
    assert result == []  # 5 + 50 = 55, matches col0


# ---------------------------------------------------------------------------
# each_row scope
# ---------------------------------------------------------------------------


def test_each_row_correct(evaluator: FormulaEvaluator) -> None:
    csv = "Item,Qty,Price,Total\nWidget,10,5,50\nGadget,3,20,60\n"
    result = evaluator.evaluate(
        page=0,
        table_csv=csv,
        formula="col3 = col1 * col2",
        scope="each_row",
        description="unit price check",
    )
    assert result == []


def test_each_row_error(evaluator: FormulaEvaluator) -> None:
    csv = "Item,Qty,Price,Total\nWidget,10,5,50\nGadget,3,20,99\n"
    result = evaluator.evaluate(
        page=0,
        table_csv=csv,
        formula="col3 = col1 * col2",
        scope="each_row",
        description="unit price check",
    )
    assert len(result) == 1
    assert result[0].expected == "60"
    assert result[0].stated == "99"


# ---------------------------------------------------------------------------
# column_total scope
# ---------------------------------------------------------------------------


def test_column_total_correct(evaluator: FormulaEvaluator) -> None:
    csv = "Name,Amount\nA,100\nB,200\nTotal,300\n"
    result = evaluator.evaluate(
        page=0,
        table_csv=csv,
        formula="sum",
        scope="column_total",
        description="total check",
        target_row=3,
        target_col=1,
    )
    assert result == []


def test_column_total_error(evaluator: FormulaEvaluator) -> None:
    csv = "Name,Amount\nA,100\nB,200\nTotal,400\n"
    result = evaluator.evaluate(
        page=0,
        table_csv=csv,
        formula="sum",
        scope="column_total",
        description="total check",
        target_row=3,
        target_col=1,
    )
    assert len(result) == 1
    assert result[0].expected == "300"


# ---------------------------------------------------------------------------
# single_cell scope
# ---------------------------------------------------------------------------


def test_single_cell_correct(evaluator: FormulaEvaluator) -> None:
    csv = "A,B,C\n10,20,30\n5,15,20\n15,35,50\n"
    result = evaluator.evaluate(
        page=0,
        table_csv=csv,
        formula="cell(3,2) = cell(1,2) + cell(2,2)",
        scope="single_cell",
        description="grand total",
    )
    assert result == []


def test_single_cell_error(evaluator: FormulaEvaluator) -> None:
    csv = "A,B,C\n10,20,30\n5,15,20\n15,35,99\n"
    result = evaluator.evaluate(
        page=0,
        table_csv=csv,
        formula="cell(3,2) = cell(1,2) + cell(2,2)",
        scope="single_cell",
        description="grand total",
    )
    assert len(result) == 1
    assert result[0].expected == "50"
