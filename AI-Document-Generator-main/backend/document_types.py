from __future__ import annotations

from typing import List, Tuple


KEYWORDS: List[Tuple[str, str]] = [
    ("business card", "business_card"),
    ("business-card", "business_card"),
    ("card", "business_card"),
    ("recipe", "recipe"),
    ("cookbook", "recipe"),
    ("menu", "menu"),
    ("flyer", "flyer"),
    ("brochure", "brochure"),
    ("poster", "poster"),
    ("slide", "presentation"),
    ("deck", "presentation"),
    ("presentation", "presentation"),
    ("pitch", "presentation"),
    ("whitepaper", "whitepaper"),
    ("datasheet", "datasheet"),
    ("case study", "case_study"),
    ("press release", "press_release"),
    ("agenda", "agenda"),
    ("minutes", "minutes"),
    ("checklist", "checklist"),
    ("newsletter", "newsletter"),
    ("proposal", "proposal"),
    ("one-pager", "one_pager"),
    ("one pager", "one_pager"),
    ("invoice", "invoice"),
    ("resume", "resume"),
    ("cv", "resume"),
    ("contract", "contract"),
    ("agreement", "contract"),
    ("letter", "letter"),
    ("report", "report"),
    ("paper", "academic"),
    ("research", "academic"),
    ("thesis", "academic"),
    ("poem", "creative"),
    ("manual", "manual"),
    ("timeline", "timeline"),
]


def detect_document_type(prompt: str, latex_code: str | None = None) -> str:
    """Heuristic classifier for document types based on prompt/latex text."""
    text = (prompt or "").lower()
    latex_text = (latex_code or "").lower()
    for keyword, label in KEYWORDS:
        if keyword in text or keyword in latex_text:
            return label
    return "document"


__all__ = ["detect_document_type"]
