"""
FigureTracker — unit tests.

Tests that named figures are correctly accumulated and that conflicting
sightings (same label, different value) are surfaced as consistency warnings.
"""

from decimal import Decimal

import pytest

from stirling.agents.ledger.validators.figures import FigureTracker


@pytest.fixture
def tracker() -> FigureTracker:
    return FigureTracker(tolerance=Decimal("0.01"))


# ---------------------------------------------------------------------------
# No conflicts
# ---------------------------------------------------------------------------


def test_no_conflicts_single_figure(tracker: FigureTracker) -> None:
    tracker.record("Net Profit", Decimal("1200.00"), page=3, raw="£1,200.00")
    assert tracker.conflicts() == []


def test_no_conflicts_consistent_figure(tracker: FigureTracker) -> None:
    """The same figure cited identically on two pages must not raise a conflict."""
    tracker.record("Total Revenue", Decimal("5000.00"), page=1, raw="£5,000")
    tracker.record("Total Revenue", Decimal("5000.00"), page=8, raw="£5,000")
    assert tracker.conflicts() == []


def test_no_conflicts_within_tolerance(tracker: FigureTracker) -> None:
    """A difference within tolerance must not be flagged."""
    tracker.record("VAT", Decimal("100.00"), page=2, raw="£100.00")
    tracker.record("VAT", Decimal("100.005"), page=5, raw="£100.005")
    assert tracker.conflicts() == []


# ---------------------------------------------------------------------------
# Conflicts
# ---------------------------------------------------------------------------


def test_conflict_different_values(tracker: FigureTracker) -> None:
    """Same label, different value on two pages → one consistency warning."""
    tracker.record("Net Profit", Decimal("1200.00"), page=3, raw="£1,200")
    tracker.record("Net Profit", Decimal("1250.00"), page=7, raw="£1,250")
    conflicts = tracker.conflicts()
    assert len(conflicts) == 1
    d = conflicts[0]
    assert d.kind == "consistency"
    assert d.severity == "warning"
    assert d.page == 7  # later occurrence is flagged


def test_conflict_three_sightings_two_values(tracker: FigureTracker) -> None:
    """Three sightings where one differs from canonical → 1 conflict."""
    tracker.record("Revenue", Decimal("1000"), page=1, raw="£1,000")
    tracker.record("Revenue", Decimal("1000"), page=3, raw="£1,000")
    tracker.record("Revenue", Decimal("999"), page=5, raw="£999")
    conflicts = tracker.conflicts()
    # Canonical=p1 (1000). p3 matches, p5 differs → 1 conflict
    assert len(conflicts) == 1
    assert conflicts[0].page == 5


# ---------------------------------------------------------------------------
# Label normalisation
# ---------------------------------------------------------------------------


def test_label_normalisation_case_insensitive(tracker: FigureTracker) -> None:
    """Labels must be compared case-insensitively."""
    tracker.record("Net Profit", Decimal("1200"), page=2, raw="1200")
    tracker.record("net profit", Decimal("1100"), page=4, raw="1100")
    assert len(tracker.conflicts()) == 1


def test_label_normalisation_punctuation(tracker: FigureTracker) -> None:
    """Colons and dashes in labels must be normalised before comparison."""
    tracker.record("Total Revenue:", Decimal("5000"), page=1, raw="5000")
    tracker.record("Total Revenue —", Decimal("4000"), page=9, raw="4000")
    assert len(tracker.conflicts()) == 1


# ---------------------------------------------------------------------------
# Entry count
# ---------------------------------------------------------------------------


def test_entry_count(tracker: FigureTracker) -> None:
    tracker.record("A", Decimal("1"), page=0, raw="1")
    tracker.record("A", Decimal("1"), page=1, raw="1")
    tracker.record("B", Decimal("2"), page=2, raw="2")
    assert tracker.entry_count == 3
