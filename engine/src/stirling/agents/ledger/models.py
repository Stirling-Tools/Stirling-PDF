"""
Ledger Auditor — internal models used only by validators.

Wire-protocol models (FolioManifest, Evidence, Verdict, etc.) live in
``stirling.contracts.ledger``. This module re-exports them for convenience
and defines validator-internal helpers that never cross the wire.
"""

from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel

# Re-export wire-protocol types so validator imports (``from ..models import ...``)
# continue to work without changing every file.
from stirling.contracts.ledger import (
    Discrepancy as Discrepancy,
)
from stirling.contracts.ledger import (
    DiscrepancyKind as DiscrepancyKind,
)
from stirling.contracts.ledger import (
    Evidence as Evidence,
)
from stirling.contracts.ledger import (
    Folio as Folio,
)
from stirling.contracts.ledger import (
    FolioManifest as FolioManifest,
)
from stirling.contracts.ledger import (
    FolioType as FolioType,
)
from stirling.contracts.ledger import (
    Requisition as Requisition,
)
from stirling.contracts.ledger import (
    Severity as Severity,
)
from stirling.contracts.ledger import (
    Verdict as Verdict,
)

# ---------------------------------------------------------------------------
# Internal helpers used only by the validators (never cross the wire)
# ---------------------------------------------------------------------------


class TallyError(BaseModel):
    """One bad sum inside a table."""

    description: str
    stated: Decimal
    computed: Decimal
    location: str  # e.g. "row 4" or "column 'Total'"


class FigureRecord(BaseModel):
    """A named numeric figure seen on a specific page."""

    label: str
    value: Decimal
    page: int
    raw: str  # original string from the document
