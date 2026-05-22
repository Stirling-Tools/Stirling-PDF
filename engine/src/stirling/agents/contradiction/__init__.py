"""Contradiction agent — Python-only textual contradiction detection.

No Java counterpart, no HTTP endpoint, no resume-turn artifact. The
detector is consumed directly by :class:`PdfReviewAgent` (single-turn
plan-emitting branch) and by :class:`PdfQuestionAgent` (via a
smart-model toolset capability).
"""

from stirling.agents.contradiction.capability import ContradictionCapability
from stirling.agents.contradiction.detector import ContradictionDetector
from stirling.agents.contradiction.intent import ContradictionIntentClassifier

__all__ = [
    "ContradictionCapability",
    "ContradictionDetector",
    "ContradictionIntentClassifier",
]
