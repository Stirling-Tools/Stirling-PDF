"""
ArithmeticScanner — unit tests.

Tests cover the two inline arithmetic patterns the scanner targets:
  1. Equals expressions:        A + B = C
  2. Total-then-addends:        Total: C (A + B)
"""

from decimal import Decimal

import pytest

from stirling.agents.ledger.validators.arithmetic import ArithmeticScanner


@pytest.fixture
def scanner() -> ArithmeticScanner:
    return ArithmeticScanner(tolerance=Decimal("0.01"))


# ---------------------------------------------------------------------------
# Equals expressions: A + B + C = D
# ---------------------------------------------------------------------------


def test_correct_equals_expression(scanner: ArithmeticScanner) -> None:
    """A correct sum should produce no findings."""
    text = "The total cost is 100 + 200 + 150 = 450."
    assert scanner.scan(page=0, text=text) == []


def test_wrong_equals_expression(scanner: ArithmeticScanner) -> None:
    """An incorrect sum should produce one error discrepancy."""
    text = "Revenue: 500 + 300 = 900"  # should be 800
    discrepancies = scanner.scan(page=3, text=text)
    assert len(discrepancies) == 1
    d = discrepancies[0]
    assert d.page == 3
    assert d.kind == "arithmetic"
    assert d.severity == "error"
    assert d.stated == "900"
    assert d.expected == "800"


def test_subtraction_expression(scanner: ArithmeticScanner) -> None:
    """Subtraction in expressions should be evaluated correctly."""
    text = "Net: 1000 - 250 = 750"
    assert scanner.scan(page=0, text=text) == []


def test_wrong_subtraction(scanner: ArithmeticScanner) -> None:
    text = "Net: 1000 - 250 = 800"  # should be 750
    discrepancies = scanner.scan(page=0, text=text)
    assert len(discrepancies) == 1
    assert discrepancies[0].expected == "750"


def test_currency_symbols_stripped(scanner: ArithmeticScanner) -> None:
    """Currency symbols and thousand separators must not break parsing."""
    text = "Total: £1,000 + £500 = £1,500"
    assert scanner.scan(page=0, text=text) == []


def test_multiple_expressions_in_text(scanner: ArithmeticScanner) -> None:
    """Multiple expressions in the same text should each be evaluated."""
    text = (
        "Q1 revenue: 100 + 200 = 300. "
        "Q2 revenue: 150 + 100 = 350. "  # wrong: should be 250
    )
    discrepancies = scanner.scan(page=0, text=text)
    assert len(discrepancies) == 1
    assert discrepancies[0].expected == "250"


# ---------------------------------------------------------------------------
# Total-then-addends: "Total: X (A + B + C)"
# ---------------------------------------------------------------------------


def test_correct_total_then_addends(scanner: ArithmeticScanner) -> None:
    text = "Grand Total: 750 (300 + 250 + 200)"
    assert scanner.scan(page=0, text=text) == []


def test_wrong_total_then_addends(scanner: ArithmeticScanner) -> None:
    text = "Grand Total: 900 (300 + 250 + 200)"  # addends sum to 750
    discrepancies = scanner.scan(page=0, text=text)
    assert len(discrepancies) == 1
    d = discrepancies[0]
    assert d.stated == "900"
    assert d.expected == "750"


def test_total_keyword_variations(scanner: ArithmeticScanner) -> None:
    """The pattern must work for 'Sum', 'Subtotal', 'Grand Total' etc."""
    cases = [
        ("Sum: 600 (200 + 200 + 200)", True),
        ("Subtotal: 600 (200 + 200 + 200)", True),
        ("Total: 999 (200 + 200 + 200)", False),  # wrong
    ]
    for text, should_be_clean in cases:
        result = scanner.scan(page=0, text=text)
        if should_be_clean:
            assert result == [], f"Expected clean for: {text!r}"
        else:
            assert len(result) == 1, f"Expected error for: {text!r}"


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


def test_no_expressions_in_text(scanner: ArithmeticScanner) -> None:
    text = "This paragraph discusses revenue trends but contains no arithmetic."
    assert scanner.scan(page=0, text=text) == []


def test_empty_text(scanner: ArithmeticScanner) -> None:
    assert scanner.scan(page=0, text="") == []


def test_leading_negative_expression(scanner: ArithmeticScanner) -> None:
    """Expressions starting with a negative number should evaluate correctly."""
    text = "Adjustment: -100 + 250 = 150"
    assert scanner.scan(page=0, text=text) == []


def test_leading_negative_wrong(scanner: ArithmeticScanner) -> None:
    text = "Adjustment: -100 + 250 = 200"  # should be 150
    discrepancies = scanner.scan(page=0, text=text)
    assert len(discrepancies) == 1
    assert discrepancies[0].expected == "150"
