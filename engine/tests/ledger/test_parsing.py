"""Unit tests for the shared ledger number parser (_parsing.to_decimal).

Covers US and European separator conventions, currency stripping, parenthesised
negatives and non-numeric sentinels.
"""

from decimal import Decimal

import pytest

from stirling.agents.ledger.validators._parsing import to_decimal


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        # Plain integers / decimals
        ("450", Decimal("450")),
        ("1234.56", Decimal("1234.56")),
        # US convention: comma groups thousands, dot is decimal
        ("1,234.56", Decimal("1234.56")),
        ("1,234,567.89", Decimal("1234567.89")),
        ("1,234", Decimal("1234")),
        # European convention: dot groups thousands, comma is decimal
        ("1.234,56", Decimal("1234.56")),
        ("1.234.567,89", Decimal("1234567.89")),
        ("12,50", Decimal("12.50")),
        ("0,99", Decimal("0.99")),
        # Currency symbols and whitespace are stripped
        ("£1,000", Decimal("1000")),
        ("€1.234,56", Decimal("1234.56")),
        ("$ 2,500.00", Decimal("2500.00")),
        (" 1 234,56 ", Decimal("1234.56")),
        # Parenthesised negatives, in both conventions
        ("(100)", Decimal("-100")),
        ("(1,234.56)", Decimal("-1234.56")),
        ("(1.234,56)", Decimal("-1234.56")),
    ],
)
def test_to_decimal_parses(raw: str, expected: Decimal) -> None:
    assert to_decimal(raw) == expected


@pytest.mark.parametrize("raw", ["", "   ", "-", "—", "n/a", "N/A", "na", "NA", "abc"])
def test_to_decimal_returns_none_for_non_numeric(raw: str) -> None:
    assert to_decimal(raw) is None


def test_european_decimal_not_flattened_to_integer() -> None:
    # Regression: stripping the comma turned "1.234,56" into "1.234.56" (invalid) or
    # "123456" (100x too large). It must resolve to the intended 1234.56.
    assert to_decimal("1.234,56") == Decimal("1234.56")
