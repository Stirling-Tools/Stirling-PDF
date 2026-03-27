"""
Ledger Auditor — pydantic-ai dependency context.

AuditContext is the read-only bundle injected into every tool call via
RunContext[AuditContext]. It carries the Evidence the auditor is working
through, plus a shared FigureTracker that accumulates named figures
across tools so the consistency checker can cross-reference them.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from .models import Evidence, Folio
from .validators import FigureTracker


@dataclass
class AuditContext:
    """
    Everything the LedgerAuditor agent needs during a single audit round.
    Immutable evidence plus one shared mutable tracker for figure tracking.

    evidence        — the folios Java provided this round
    figure_registry — accumulates figures across all tool calls for consistency checks;
                      initialised automatically with the same tolerance as the audit
    tolerance       — maximum allowed rounding delta (e.g. Decimal("0.01") for 1p)
    final_round     — when True the agent must commit to a Verdict; no more Requisitions
    """

    evidence: Evidence
    tolerance: Decimal = field(default_factory=lambda: Decimal("0.01"))
    figure_registry: FigureTracker = field(init=False)

    def __post_init__(self) -> None:
        # Initialise the tracker with the same tolerance so figure-consistency
        # comparisons honour the same rounding allowance as arithmetic checks.
        self.figure_registry = FigureTracker(tolerance=self.tolerance)

    @property
    def session_id(self) -> str:
        """Opaque session handle — matches the ID Java opened for this audit."""
        return self.evidence.session_id

    @property
    def final_round(self) -> bool:
        """True when Java will not honour further Requisitions this session."""
        return self.evidence.final_round

    def folio(self, page: int) -> Folio | None:
        """Look up a folio by page number. Returns None if not in this round's evidence."""
        return next((f for f in self.evidence.folios if f.page == page), None)

    def all_pages(self) -> list[int]:
        """Return the 0-indexed page numbers present in this round's evidence."""
        return [f.page for f in self.evidence.folios]
