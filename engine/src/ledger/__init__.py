"""
Ledger Auditor — AI agent for validating mathematical integrity of PDF documents.

Architecture (Java → Python only; Java is the loop controller):

  Round 1  Java sends FolioManifest  →  Python returns Requisition
  Round N  Java sends Evidence       →  Python returns Requisition | Verdict
  Final    Java sends Evidence(final_round=True) → Python must return Verdict

Metaphor guide:
  Folio      — a single page and its extracted content
  FolioManifest — Java's lightweight initial page classification (no OCR/Tabula yet)
  Requisition — Python's declaration of what it needs Java to extract
  Evidence    — Java's fulfilment of a Requisition (text, tables, OCR results)
  Verdict     — the final AuditReport returned to the client
"""

from .routes import register_ledger_routes

__all__ = ["register_ledger_routes"]
