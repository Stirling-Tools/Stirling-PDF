"""Shared parsing helpers for ledger validators."""

from __future__ import annotations

import csv
import io
import re
from decimal import Decimal, InvalidOperation

# Strip currency symbols and whitespace before parsing. Thousands/decimal separators
# ("," and ".") are handled by _normalize_separators so European-formatted numbers
# (e.g. "1.234,56") are not corrupted.
STRIP_PATTERN = re.compile(r"[£$€¥\s]")

_NA_VALUES = {"-", "—", "n/a", "N/A", "na", "NA"}


def _normalize_separators(text: str) -> str:
    """Normalise thousands/decimal separators to a plain Decimal-parseable string.

    Supports both US ("1,234.56") and European ("1.234,56") conventions: when both
    separators are present the rightmost one is treated as the decimal point.
    """
    has_comma = "," in text
    has_dot = "." in text

    if has_comma and has_dot:
        if text.rfind(",") > text.rfind("."):
            # European "1.234,56": dot groups thousands, comma is the decimal point.
            return text.replace(".", "").replace(",", ".")
        # US "1,234.56": comma groups thousands, dot is the decimal point.
        return text.replace(",", "")

    if has_comma:
        # Only commas. A single comma with 1-2 trailing digits is a decimal point
        # (European "12,50"); anything else (multiple commas, or 3-digit groups) is a
        # thousands separator (US "1,234").
        groups = text.split(",")
        if len(groups) == 2 and 1 <= len(groups[-1]) <= 2:
            return text.replace(",", ".")
        return text.replace(",", "")

    return text


def to_decimal(raw: str) -> Decimal | None:
    """Parse a cell value to Decimal, returning None for non-numeric cells."""
    cleaned = STRIP_PATTERN.sub("", raw.strip())
    if not cleaned or cleaned in _NA_VALUES:
        return None
    # Handle parenthesised negatives: (123.45) → -123.45
    negative = cleaned.startswith("(") and cleaned.endswith(")")
    if negative:
        cleaned = cleaned[1:-1]
    cleaned = _normalize_separators(cleaned)
    try:
        value = Decimal(cleaned)
    except InvalidOperation:
        return None
    return -value if negative else value


def parse_csv(table_csv: str) -> list[list[str]]:
    """Parse a CSV string into rows, dropping completely empty rows."""
    reader = csv.reader(io.StringIO(table_csv.strip()))
    return [row for row in reader if any(cell.strip() for cell in row)]
