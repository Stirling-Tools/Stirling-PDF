"""ClaimLedger — accumulator for claims keyed by canonical subject.

Groups :class:`Claim` records by a normalised subject string and emits
buckets (subjects with >= 2 claims) for the contradiction detector. The
lexical key normalisation is a defensive default; once subject
canonicalisation runs, :meth:`rekey_with_canonical` replaces the keys
with the LLM-derived canonical groupings.
"""

from __future__ import annotations

import logging
import re
from collections import defaultdict

from stirling.contracts.contradiction import Claim

logger = logging.getLogger(__name__)


# Strip punctuation that varies between contexts ("deadline:" vs "deadline —").
_LABEL_NOISE = re.compile(r"[:\-—_,.;!?\s]+")
# Common English articles and demonstratives that often pad subjects.
_ARTICLES = re.compile(r"\b(?:the|a|an|this|that|these|those)\b", re.IGNORECASE)


def _normalise_subject(subject: str) -> str:
    """Return a lexical key suitable for grouping subjects with no LLM help.

    Lowercases the string, strips articles and demonstratives, then
    collapses any remaining punctuation/whitespace into single spaces.
    """
    lowered = subject.lower()
    no_articles = _ARTICLES.sub(" ", lowered)
    return _LABEL_NOISE.sub(" ", no_articles).strip()


class ClaimLedger:
    """Accumulates :class:`Claim` records grouped by normalised subject.

    Typical usage::

        ledger = ClaimLedger()
        for claim in claims:
            ledger.record(claim)
        ledger.rekey_with_canonical(mapping)  # optional
        for canonical_subject, bucket in ledger.buckets().items():
            ...
    """

    def __init__(self) -> None:
        self._records: dict[str, list[Claim]] = defaultdict(list)

    def record(self, claim: Claim) -> None:
        """Register a claim under its lexical-normalised subject key."""
        key = _normalise_subject(claim.subject)
        if not key:
            # Skip claims with empty subjects after normalisation; the
            # detector has no way to bucket them usefully.
            logger.debug("[contradiction] dropping claim with empty subject: %r", claim.subject)
            return
        self._records[key].append(claim)

    def rekey_with_canonical(self, mapping: dict[str, str]) -> None:
        """Re-group every claim under the canonical subject from ``mapping``.

        ``mapping`` maps raw (non-normalised) subject strings to the
        canonical phrase chosen by the canonicaliser. Subjects missing
        from the mapping fall back to lexical normalisation so no claim
        is silently dropped.
        """
        flattened: list[Claim] = [c for bucket in self._records.values() for c in bucket]
        new_records: dict[str, list[Claim]] = defaultdict(list)

        for claim in flattened:
            canonical = mapping.get(claim.subject)
            if canonical is None:
                # Try the lexical-normalised form as a secondary lookup
                # in case the canonicaliser was given normalised inputs.
                canonical = mapping.get(_normalise_subject(claim.subject))
            if canonical is None or not canonical.strip():
                key = _normalise_subject(claim.subject)
            else:
                key = _normalise_subject(canonical)
            if not key:
                continue
            new_records[key].append(claim)

        self._records = new_records

    def buckets(self) -> dict[str, list[Claim]]:
        """Return only buckets with at least two claims (the detector input)."""
        return {key: claims for key, claims in self._records.items() if len(claims) >= 2}

    @property
    def entry_count(self) -> int:
        return sum(len(v) for v in self._records.values())

    @property
    def unique_subjects(self) -> list[str]:
        """The set of raw subject strings seen across all recorded claims."""
        seen: set[str] = set()
        unique: list[str] = []
        for bucket in self._records.values():
            for claim in bucket:
                if claim.subject in seen:
                    continue
                seen.add(claim.subject)
                unique.append(claim.subject)
        return unique
