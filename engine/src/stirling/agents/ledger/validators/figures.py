"""
FigureTracker — cross-page consistency checker for named figures.

Collects named numeric figures as the auditor encounters them (e.g.
"Total Revenue: £1,200,000") and surfaces any that appear under the same
label but with a different value on another page — a classic symptom of
copy-paste errors or stale data in executive summaries.

The tracker is intentionally simple: normalise labels, compare values
within tolerance, emit Discrepancy for each conflict.
"""

from __future__ import annotations

import logging
import re
from decimal import Decimal

from pydantic import BaseModel

from stirling.contracts.ledger import Discrepancy, DiscrepancyKind, Severity

logger = logging.getLogger(__name__)


class FigureRecord(BaseModel):
    """A named numeric figure seen on a specific page."""

    label: str
    value: Decimal
    page: int
    raw: str


# Strip punctuation that varies between contexts ("revenue:" vs "revenue —")
_LABEL_NOISE = re.compile(r"[:\-—\s]+")


def _normalise_label(label: str) -> str:
    return _LABEL_NOISE.sub(" ", label.lower()).strip()


class FigureTracker:
    """
    Accumulates named figures during an audit and checks them for consistency.

    Typical usage:
        tracker = FigureTracker()
        tracker.record("Net Profit", Decimal("1200.00"), page=3, raw="£1,200.00")
        tracker.record("Net Profit", Decimal("1250.00"), page=7, raw="£1,250.00")
        discrepancies = tracker.conflicts()  # returns one Discrepancy
    """

    def __init__(self, tolerance: Decimal = Decimal("0.01")) -> None:
        self.tolerance = tolerance
        self._ledger: dict[str, list[FigureRecord]] = {}

    def record(self, label: str, value: Decimal, page: int, raw: str) -> None:
        """Register a named figure sighting."""
        key = _normalise_label(label)
        self._ledger.setdefault(key, []).append(FigureRecord(label=key, value=value, page=page, raw=raw))

    def conflicts(self) -> list[Discrepancy]:
        """
        Return a Discrepancy for every label that has sightings whose value
        differs from the first-seen (canonical) value by more than tolerance.

        O(n) per label — each record is compared against the canonical only.
        """
        discrepancies: list[Discrepancy] = []

        for label, records in self._ledger.items():
            if len(records) < 2:
                continue
            canonical = records[0]
            for other in records[1:]:
                if abs(canonical.value - other.value) > self.tolerance:
                    discrepancies.append(
                        Discrepancy(
                            page=other.page,
                            kind=DiscrepancyKind.CONSISTENCY,
                            severity=Severity.WARNING,
                            description=(
                                f'"{label}" stated as {canonical.raw} on page'
                                f" {canonical.page + 1}"
                                f" but {other.raw} on page {other.page + 1}"
                            ),
                            stated=other.raw,
                            expected=canonical.raw,
                            context=(f"First seen: page {canonical.page + 1} | Later: page {other.page + 1}"),
                        )
                    )

        return discrepancies

    @property
    def entry_count(self) -> int:
        return sum(len(v) for v in self._ledger.values())
