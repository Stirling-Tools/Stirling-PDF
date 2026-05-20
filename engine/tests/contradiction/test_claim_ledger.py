"""ClaimLedger — unit tests.

Tests the lexical-normalisation grouping, ``rekey_with_canonical``
re-grouping behaviour, and the ``buckets`` filter (>= 2 only). The
ledger is the source of truth for which canonical-subject buckets get
fed to the contradiction detector, so its grouping rules are part of
the agent's contract.
"""

from __future__ import annotations

import pytest

from stirling.agents.contradiction.validators import ClaimLedger
from stirling.contracts.contradiction import Claim, ClaimPolarity


def _claim(
    subject: str,
    *,
    page: int = 1,
    polarity: ClaimPolarity = "assert",
    text: str | None = None,
    quote: str | None = None,
) -> Claim:
    return Claim(
        page=page,
        subject=subject,
        polarity=polarity,
        text=text or f"Paraphrase of {subject}",
        quote=quote or f'"{subject}" was found here.',
    )


@pytest.fixture
def ledger() -> ClaimLedger:
    return ClaimLedger()


# Empty ledger


def test_empty_ledger_has_zero_entries(ledger: ClaimLedger) -> None:
    assert ledger.entry_count == 0
    assert ledger.buckets() == {}
    assert ledger.unique_subjects == []


# Singletons are not buckets


def test_single_claim_subject_is_not_a_bucket(ledger: ClaimLedger) -> None:
    """``buckets`` only emits subjects with >= 2 claims (the detector's input shape)."""
    ledger.record(_claim("Project Deadline"))
    assert ledger.entry_count == 1
    assert ledger.buckets() == {}


# Lexical normalisation


def test_lexical_normalisation_collapses_articles_and_punctuation(
    ledger: ClaimLedger,
) -> None:
    """All three of these subjects must hash to the same key.

    The lexical key strips: lowercase, articles ("the"/"a"/"an"), and
    punctuation/whitespace runs.
    """
    ledger.record(_claim("Project Deadline:", page=1))
    ledger.record(_claim("the project deadline", page=2))
    ledger.record(_claim("  PROJECT DEADLINE  ", page=3))

    buckets = ledger.buckets()
    assert len(buckets) == 1
    only_bucket = next(iter(buckets.values()))
    assert len(only_bucket) == 3
    assert {claim.page for claim in only_bucket} == {1, 2, 3}


def test_duplicates_not_deduped_at_ledger_level(ledger: ClaimLedger) -> None:
    """Two structurally identical claims are both kept; deduplication is the
    detector's responsibility, not the ledger's."""
    claim = _claim("alpha", page=1)
    ledger.record(claim)
    ledger.record(claim)
    assert ledger.entry_count == 2
    bucket = ledger.buckets()
    assert len(bucket) == 1
    assert len(next(iter(bucket.values()))) == 2


# rekey_with_canonical


def test_canonical_keys_collapse_multiple_raw_subjects(ledger: ClaimLedger) -> None:
    """Two distinct raw subjects must collapse once the canonicaliser tells us
    they refer to the same thing."""
    ledger.record(_claim("Q3 revenue", page=1))
    ledger.record(_claim("third-quarter sales", page=2))

    # Before rekeying, they live in separate (singleton) lexical buckets.
    assert ledger.buckets() == {}

    ledger.rekey_with_canonical(
        {
            "Q3 revenue": "quarterly revenue",
            "third-quarter sales": "quarterly revenue",
        }
    )

    buckets = ledger.buckets()
    assert len(buckets) == 1
    only_bucket = next(iter(buckets.values()))
    assert len(only_bucket) == 2
    assert {claim.page for claim in only_bucket} == {1, 2}


def test_rekey_with_missing_canonical_falls_back_to_lexical(
    ledger: ClaimLedger,
) -> None:
    """A claim whose subject is missing from the mapping must still survive
    re-keying — its lexical-normalised form takes over as the key."""
    ledger.record(_claim("alpha", page=1))
    ledger.record(_claim("alpha", page=2))
    ledger.rekey_with_canonical({})
    assert ledger.entry_count == 2
    buckets = ledger.buckets()
    assert len(buckets) == 1
    assert len(next(iter(buckets.values()))) == 2


def test_rekey_with_empty_canonical_does_not_lose_record(
    ledger: ClaimLedger,
) -> None:
    """A canonical of "" or whitespace must NOT cause silent drop — the
    lexical fallback kicks in instead.
    """
    ledger.record(_claim("alpha", page=1))
    ledger.record(_claim("alpha", page=2))
    ledger.rekey_with_canonical({"alpha": "   "})
    assert ledger.entry_count == 2


def test_unique_subjects_returns_each_raw_subject_once(ledger: ClaimLedger) -> None:
    ledger.record(_claim("alpha", page=1))
    ledger.record(_claim("alpha", page=2))
    ledger.record(_claim("beta", page=1))
    subjects = ledger.unique_subjects
    assert sorted(subjects) == ["alpha", "beta"]


def test_empty_subject_after_normalisation_is_dropped(ledger: ClaimLedger) -> None:
    """A subject made entirely of punctuation collapses to empty and is dropped."""
    ledger.record(_claim("   ---   ", page=1))
    ledger.record(_claim("real", page=2))
    assert ledger.entry_count == 1
