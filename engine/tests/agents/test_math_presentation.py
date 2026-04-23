"""Tests for ``stirling.agents.math_presentation``.

Focus is on the Verdict → CommentSpec projection — specifically that each spec
carries an ``anchor_text`` value so the ``/api/v1/misc/add-comments`` server can
place the sticky note at the line where the discrepancy was flagged instead of
the fixed right-margin fallback.
"""

from __future__ import annotations

from stirling.agents.math_presentation import (
    is_math_intent,
    verdict_to_add_comments_payload,
    verdict_to_comment_specs,
)
from stirling.contracts.ledger import Discrepancy, DiscrepancyKind, Severity, Verdict


def _make_verdict(discrepancies: list[Discrepancy]) -> Verdict:
    return Verdict(
        session_id="s1",
        discrepancies=discrepancies,
        pages_examined=[d.page for d in discrepancies] or [0],
        rounds_taken=1,
        summary="Test verdict.",
        clean=not discrepancies,
    )


def test_specs_prefer_stated_as_anchor_text() -> None:
    verdict = _make_verdict(
        [
            Discrepancy(
                page=0,
                kind=DiscrepancyKind.TALLY,
                severity=Severity.ERROR,
                description="Column total is wrong.",
                stated="$215,000",
                expected="$215,500",
                context="Total row",
            )
        ]
    )

    specs = verdict_to_comment_specs(verdict)
    assert len(specs) == 1
    assert specs[0].anchor_text == "$215,000"


def test_specs_fall_back_to_context_when_stated_missing() -> None:
    verdict = _make_verdict(
        [
            Discrepancy(
                page=1,
                kind=DiscrepancyKind.STATEMENT,
                severity=Severity.WARNING,
                description="Claim contradicts numbers.",
                stated="",
                expected="",
                context="We grew 15% this year",
            )
        ]
    )

    specs = verdict_to_comment_specs(verdict)
    assert specs[0].anchor_text == "We grew 15% this year"


def test_specs_anchor_text_none_when_no_hints() -> None:
    verdict = _make_verdict(
        [
            Discrepancy(
                page=0,
                kind=DiscrepancyKind.TALLY,
                severity=Severity.ERROR,
                description="Column total is wrong.",
                stated="",
                expected="500",
                context="",
            )
        ]
    )

    specs = verdict_to_comment_specs(verdict)
    assert specs[0].anchor_text is None


def test_payload_serialises_anchor_text_as_camel_case() -> None:
    verdict = _make_verdict(
        [
            Discrepancy(
                page=2,
                kind=DiscrepancyKind.ARITHMETIC,
                severity=Severity.ERROR,
                description="Off by ten.",
                stated="110",
                expected="100",
                context="Line 3",
            )
        ]
    )

    import json as _json

    payload = _json.loads(verdict_to_add_comments_payload(verdict))
    assert len(payload) == 1
    # Java deserialises via record-component names (camelCase), so the JSON
    # key must be ``anchorText`` not ``anchor_text``.
    assert payload[0]["anchorText"] == "110"
    assert payload[0]["pageIndex"] == 2


def test_is_math_intent_matches_math_keywords() -> None:
    assert is_math_intent("Is the math in this document correct?")
    assert is_math_intent("Please audit the invoice totals.")
    assert not is_math_intent("Summarise this document.")
    assert not is_math_intent("")
