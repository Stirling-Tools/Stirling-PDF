from decimal import Decimal

import pytest

from stirling.agents.ledger.validators.formula import FormulaEvaluator


@pytest.mark.parametrize(
    ("expression", "expected"),
    [
        ("-5 + 2", Decimal("-3")),
        ("10 + -2", Decimal("8")),
        ("10 - -2", Decimal("12")),
        ("3 * 4 + 2", Decimal("14")),
        ("12 / 3 - 1", Decimal("3")),
        ("", None),
        ("-", None),
        ("4 / 0", None),
        ("1 +", None),
    ],
)
def test_safe_eval_handles_supported_arithmetic_and_invalid_input(expression: str, expected: Decimal | None) -> None:
    assert FormulaEvaluator()._safe_eval(expression) == expected


def test_eval_row_expr_resolves_sum_and_cell_references() -> None:
    rows = [["header", "value"], ["x", "2"], ["x", "3"], ["x", "5"]]

    assert FormulaEvaluator()._eval_row_expr("sum(col1, 1-3)", rows[1], rows) == Decimal("10")
    assert FormulaEvaluator()._eval_row_expr("cell(2, 1) + col1", rows[1], rows) == Decimal("5")
    assert FormulaEvaluator()._eval_row_expr("cell(99, 1)", rows[1], rows) is None
    assert FormulaEvaluator()._eval_row_expr("col9", rows[1], rows) is None


def test_formula_evaluator_skips_invalid_scopes_and_references() -> None:
    evaluator = FormulaEvaluator()
    table = "A,B,C\n1,2,3\n4,5,6"

    assert evaluator.evaluate(0, "only one row", "col1 = col2", "each_row", "x") == []
    assert evaluator.evaluate(0, table, "broken", "each_row", "x") == []
    assert evaluator.evaluate(0, table, "bad = col1", "each_row", "x") == []
    assert evaluator.evaluate(0, table, "col1 = col2", "each_row", "x", row_range=[99]) == []
    assert evaluator.evaluate(0, table, "col1 = col2", "unknown", "x") == []
    assert evaluator.evaluate(0, table, "col1 = col2", "column_total", "x") == []
    assert evaluator.evaluate(0, table, "col1 = col2", "column_total", "x", target_row=99) == []
    assert evaluator.evaluate(0, table, "col1 = col2", "column_total", "x", target_row=2, target_col=99) == []
    assert evaluator.evaluate(0, table, "bad", "single_cell", "x") == []
    assert evaluator.evaluate(0, table, "cell(99, 1) = col1", "single_cell", "x") == []
    assert evaluator.evaluate(0, table, "cell(1, 99) = col1", "single_cell", "x") == []
