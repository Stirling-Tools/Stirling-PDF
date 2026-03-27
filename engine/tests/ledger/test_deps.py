"""
AuditContext — unit tests.

No LLM, no network, no PDF. Pure in-memory dataclass behaviour.
FigureTracker is tested independently in test_figure_tracker.py; here we
only verify that AuditContext wires it up correctly.
"""

from decimal import Decimal

from ledger.deps import AuditContext
from ledger.models import Evidence, Folio
from ledger.validators import FigureTracker


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _evidence(
    session_id: str = "test-session",
    pages: list[int] | None = None,
    final_round: bool = False,
    round_num: int = 2,
) -> Evidence:
    """Build a minimal Evidence with one folio per requested page."""
    folios = [Folio(page=p, text=f"Page {p} text") for p in (pages or [0])]
    return Evidence(
        session_id=session_id,
        folios=folios,
        round=round_num,
        final_round=final_round,
    )


# ---------------------------------------------------------------------------
# AuditContext — property delegation and folio lookup
# ---------------------------------------------------------------------------


class TestAuditContext:
    """Tests for AuditContext property delegation, folio lookup, and defaults."""

    def test_session_id_delegated_from_evidence(self) -> None:
        """session_id must be forwarded from the Evidence."""
        ctx = AuditContext(evidence=_evidence(session_id="abc-123"))
        assert ctx.session_id == "abc-123"

    def test_final_round_true_delegated(self) -> None:
        """final_round=True must be forwarded from the Evidence."""
        ctx = AuditContext(evidence=_evidence(final_round=True))
        assert ctx.final_round is True

    def test_final_round_false_by_default(self) -> None:
        """final_round defaults to False when not set in Evidence."""
        ctx = AuditContext(evidence=_evidence(final_round=False))
        assert ctx.final_round is False

    def test_all_pages_returns_folio_page_numbers(self) -> None:
        """all_pages() must return exactly the page numbers in the evidence folios."""
        ctx = AuditContext(evidence=_evidence(pages=[0, 2, 4]))
        assert ctx.all_pages() == [0, 2, 4]

    def test_folio_lookup_hit(self) -> None:
        """folio(page) must return the Folio for a page that is present."""
        ctx = AuditContext(evidence=_evidence(pages=[0, 1, 2]))
        folio = ctx.folio(1)
        assert folio is not None
        assert folio.page == 1

    def test_folio_lookup_miss_returns_none(self) -> None:
        """folio(page) must return None for a page not in this round's evidence."""
        ctx = AuditContext(evidence=_evidence(pages=[0, 1]))
        assert ctx.folio(99) is None

    def test_default_tolerance(self) -> None:
        """tolerance defaults to Decimal('0.01') when not specified."""
        ctx = AuditContext(evidence=_evidence())
        assert ctx.tolerance == Decimal("0.01")

    def test_custom_tolerance(self) -> None:
        """A custom tolerance is stored and accessible."""
        ctx = AuditContext(evidence=_evidence(), tolerance=Decimal("0.05"))
        assert ctx.tolerance == Decimal("0.05")

    def test_figure_registry_is_figure_tracker(self) -> None:
        """figure_registry must be a FigureTracker (not a raw dict or other type)."""
        ctx = AuditContext(evidence=_evidence())
        assert isinstance(ctx.figure_registry, FigureTracker)

    def test_figure_registry_starts_empty(self) -> None:
        """A freshly created AuditContext must have no figures registered."""
        ctx = AuditContext(evidence=_evidence())
        assert ctx.figure_registry.conflicts() == []

    def test_figure_registry_tolerance_matches_context(self) -> None:
        """The FigureTracker must be initialised with the same tolerance as the context."""
        ctx = AuditContext(evidence=_evidence(), tolerance=Decimal("0.05"))
        assert ctx.figure_registry.tolerance == Decimal("0.05")

    def test_figure_registry_shared_across_lookups(self) -> None:
        """The same FigureTracker instance persists — records accumulate across tool calls."""
        ctx = AuditContext(evidence=_evidence())
        ctx.figure_registry.record("Tax", Decimal("240"), page=0, raw="240")
        ctx.figure_registry.record("Tax", Decimal("300"), page=1, raw="300")
        assert len(ctx.figure_registry.conflicts()) == 1
