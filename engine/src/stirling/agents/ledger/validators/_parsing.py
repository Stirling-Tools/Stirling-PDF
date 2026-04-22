"""Shared parsing helpers for ledger validators."""

from __future__ import annotations

import csv
import io
import re
from decimal import Decimal, InvalidOperation

# Strip common currency symbols and thousands separators before parsing.
STRIP_PATTERN = re.compile(r"[£$€¥,\s]")


def to_decimal(raw: str) -> Decimal | None:
    """Parse a cell value to Decimal, returning None for non-numeric cells."""
    cleaned = STRIP_PATTERN.sub("", raw.strip())
    if not cleaned or cleaned in {"-", "—", "n/a", "N/A", "na", "NA"}:
        return None
    # Handle parenthesised negatives: (123.45) → -123.45
    if cleaned.startswith("(") and cleaned.endswith(")"):
        cleaned = "-" + cleaned[1:-1]
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def parse_csv(table_csv: str) -> list[list[str]]:
    """Parse a CSV string into rows, dropping completely empty rows."""
    reader = csv.reader(io.StringIO(table_csv.strip()))
    return [row for row in reader if any(cell.strip() for cell in row)]
