"""
ContradictionAgent — agent-level integration tests.

The pydantic-ai sub-agents (``_examiner``, ``_claim_extractor``,
``_subject_canonicaliser``, ``_contradiction_detector``, ``_summary_agent``)
are patched with stubs so the test never hits a real model. These tests
exercise the *agent's reasoning glue*: bucket extraction → canonicalisation
→ pre-filter → batched detection → verdict assembly.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from unittest.mock import patch

import pytest
from pydantic_ai.exceptions import AgentRunError

from stirling.agents.contradiction.agent import (
    ContradictionAgent,
    _BucketContradictions,
    _ClaimExtractionResult,
    _DetectedPair,
    _SubjectCanonicalisationResult,
)
from stirling.contracts.contradiction import (
    Claim,
    Contradiction,
    ContradictionSeverity,
    ContradictionVerdict,
    Evidence,
    Folio,
    FolioManifest,
    FolioType,
    Requisition,
)
from stirling.services.runtime import AppRuntime


# ---------------------------------------------------------------------------
# Stub plumbing
# ---------------------------------------------------------------------------


@dataclass
class _StubResult:
    """Mimics the ``AgentRunResult`` shape: anything with an ``.output`` attr."""

    output: Any


def _claim(
    page: int,
    subject: str,
    polarity: str = "assert",
    quote: str | None = None,
) -> Claim:
    return Claim(
        page=page,
        subject=subject,
        polarity=polarity,  # type: ignore[arg-type]
        text=f"{subject} on page {page + 1} ({polarity}).",
        quote=quote or f"page-{page}-quote-{polarity}",
    )


def _folio(page: int, text: str) -> Folio:
    return Folio(page=page, text=text, tables=None, ocr_text=None, ocr_confidence=None)


def _evidence(folios: list[Folio]) -> Evidence:
    return Evidence(
        session_id="test-session",
        folios=folios,
        round=2,
        final_round=True,
        unauditable_pages=[],
    )


# ---------------------------------------------------------------------------
# examine
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_examine_returns_requisition_with_no_table_requests(
    runtime: AppRuntime,
) -> None:
    """The contradiction agent must never request tables — even if the LLM
    somehow includes them, the agent strips them defensively."""
    agent = ContradictionAgent(runtime)
    manifest = FolioManifest(
        session_id="s",
        page_count=2,
        folio_types=[FolioType.TEXT, FolioType.TEXT],
        round=1,
    )
    canned = Requisition(
        need_text=[0, 1],
        need_tables=[0],  # the LLM somehow misbehaved — agent must drop this
        need_ocr=[],
        rationale="textual contradictions",
    )

    with patch.object(agent._examiner, "run", return_value=_StubResult(output=canned)):
        result = await agent.examine(manifest)

    assert isinstance(result, Requisition)
    assert result.need_tables == []
    assert result.need_text == [0, 1]


# ---------------------------------------------------------------------------
# deliberate
# ---------------------------------------------------------------------------


def _patch_extractor(agent: ContradictionAgent, page_to_claims: dict[int, list[Claim]]):
    """Patch the per-page claim extractor to return canned claims keyed by page.

    The extractor receives the page number via the prompt; we sniff the prompt
    to dispatch the right canned response. This mirrors the math-auditor
    test patterns of patching ``Agent.run``.
    """

    async def _run(prompt: str, *_a: Any, **_kw: Any) -> _StubResult:
        # Prompt format: "Page <1-indexed>:\n<text>"
        # Parse the page out of the first line.
        first = prompt.split("\n", 1)[0]
        # "Page 1 text" → 0-indexed = 0
        try:
            page_num = int(first.split()[1]) - 1
        except (IndexError, ValueError):
            page_num = -1
        return _StubResult(
            output=_ClaimExtractionResult(claims=page_to_claims.get(page_num, []))
        )

    return patch.object(agent._claim_extractor, "run", side_effect=_run)


def _patch_canonicaliser(agent: ContradictionAgent, mapping: dict[str, str] | None):
    """Patch the subject canonicaliser; ``None`` makes it raise AgentRunError."""

    async def _run(_prompt: str, *_a: Any, **_kw: Any) -> _StubResult:
        if mapping is None:
            raise AgentRunError("simulated canonicaliser failure")
        return _StubResult(
            output=_SubjectCanonicalisationResult(mapping=mapping),
        )

    return patch.object(agent._subject_canonicaliser, "run", side_effect=_run)


def _patch_detector(
    agent: ContradictionAgent, pairs_by_subject: dict[str, list[_DetectedPair]]
):
    """Patch the contradiction detector; reads the canonical subject from the
    prompt's first line ("Canonical subject: <subject>") and returns canned
    pairs for that subject."""

    async def _run(prompt: str, *_a: Any, **_kw: Any) -> _StubResult:
        first = prompt.split("\n", 1)[0]
        # "Canonical subject: <subject>" → strip prefix
        prefix = "Canonical subject:"
        canonical = first[len(prefix):].strip() if first.startswith(prefix) else ""
        pairs = pairs_by_subject.get(canonical, [])
        return _StubResult(output=_BucketContradictions(pairs=pairs))

    return patch.object(agent._contradiction_detector, "run", side_effect=_run)


def _patch_summary(agent: ContradictionAgent, summary: str = "stub summary"):
    async def _run(_prompt: str, *_a: Any, **_kw: Any) -> _StubResult:
        return _StubResult(output=summary)

    return patch.object(agent._summary_agent, "run", side_effect=_run)


@pytest.mark.anyio
async def test_deliberate_empty_evidence_returns_clean(runtime: AppRuntime) -> None:
    agent = ContradictionAgent(runtime)
    evidence = _evidence([])
    with _patch_summary(agent):
        verdict = await agent.deliberate(evidence)

    assert isinstance(verdict, ContradictionVerdict)
    assert verdict.contradictions == []
    assert verdict.clean is True


@pytest.mark.anyio
async def test_deliberate_two_opposite_polarity_yields_one_contradiction(
    runtime: AppRuntime,
) -> None:
    """Two claims, same subject, opposite polarity → exactly one Contradiction."""
    agent = ContradictionAgent(runtime)
    claim1 = _claim(0, "deadline", polarity="assert")
    claim2 = _claim(2, "deadline", polarity="deny")
    evidence = _evidence([_folio(0, "page 1 text"), _folio(2, "page 3 text")])

    extractor = _patch_extractor(agent, {0: [claim1], 2: [claim2]})
    canon = _patch_canonicaliser(agent, {"deadline": "deadline"})
    detector = _patch_detector(
        agent,
        {
            "deadline": [
                _DetectedPair(
                    i=0,
                    j=1,
                    explanation="page 1 asserts; page 3 denies",
                    severity="error",
                )
            ]
        },
    )
    summary = _patch_summary(agent)

    with extractor, canon, detector, summary:
        verdict = await agent.deliberate(evidence)

    assert len(verdict.contradictions) == 1
    contradiction = verdict.contradictions[0]
    assert contradiction.severity == ContradictionSeverity.ERROR
    assert contradiction.page1 < contradiction.page2
    # Round-trip the Claim objects.
    assert contradiction.claim1.page in {0, 2}
    assert contradiction.claim2.page in {0, 2}
    assert {contradiction.claim1.page, contradiction.claim2.page} == {0, 2}
    assert verdict.clean is False  # ERROR-severity contradiction


@pytest.mark.anyio
async def test_deliberate_same_polarity_paraphrase_filtered(
    runtime: AppRuntime,
) -> None:
    """The agent's pre-filter drops same-page same-polarity duplicates so
    paraphrase noise on a single page is not flagged as a contradiction."""
    agent = ContradictionAgent(runtime)
    # Same page, same polarity → pre-filter must drop the pair.
    claim1 = _claim(0, "deadline", polarity="assert", quote="quote-A")
    claim2 = _claim(0, "deadline", polarity="assert", quote="quote-B")
    evidence = _evidence([_folio(0, "page 1 text")])

    extractor = _patch_extractor(agent, {0: [claim1, claim2]})
    canon = _patch_canonicaliser(agent, {"deadline": "deadline"})
    # Even if the detector lies and returns the pair, the agent's
    # post-filter must drop it.
    detector = _patch_detector(
        agent,
        {
            "deadline": [
                _DetectedPair(
                    i=0,
                    j=1,
                    explanation="should be dropped",
                    severity="error",
                )
            ]
        },
    )
    summary = _patch_summary(agent)

    with extractor, canon, detector, summary:
        verdict = await agent.deliberate(evidence)

    assert verdict.contradictions == []


@pytest.mark.anyio
async def test_deliberate_identical_quote_pair_filtered(
    runtime: AppRuntime,
) -> None:
    """Identical quotes are duplicate sightings, not contradictions —
    the post-filter must drop them even if the detector returned them."""
    agent = ContradictionAgent(runtime)
    same_quote = "the deadline is Friday"
    claim1 = _claim(0, "deadline", polarity="assert", quote=same_quote)
    claim2 = _claim(2, "deadline", polarity="deny", quote=same_quote)
    evidence = _evidence([_folio(0, "p1"), _folio(2, "p3")])

    extractor = _patch_extractor(agent, {0: [claim1], 2: [claim2]})
    canon = _patch_canonicaliser(agent, {"deadline": "deadline"})
    detector = _patch_detector(
        agent,
        {
            "deadline": [
                _DetectedPair(
                    i=0,
                    j=1,
                    explanation="should be filtered as duplicate quote",
                    severity="error",
                )
            ]
        },
    )
    summary = _patch_summary(agent)

    with extractor, canon, detector, summary:
        verdict = await agent.deliberate(evidence)

    assert verdict.contradictions == []


@pytest.mark.anyio
async def test_deliberate_large_bucket_chunked_with_overlap(
    runtime: AppRuntime,
) -> None:
    """A bucket of 14 claims must be chunked (chunk_size=12, overlap=2). A
    contradicting pair injected at indices (12, 13) — which straddle the
    first chunk's tail — must still be detected via the second chunk.
    """
    agent = ContradictionAgent(runtime)

    # 14 unique claims on different pages, alternating polarity so the
    # same-polarity pre-filter doesn't accidentally collapse them.
    claims: list[Claim] = []
    for i in range(14):
        polarity = "assert" if i % 2 == 0 else "neutral"
        claims.append(
            _claim(page=i, subject="topic", polarity=polarity, quote=f"quote-{i}")
        )
    # Page 12 asserts; page 13 denies — make this pair the contradiction.
    claims[12] = _claim(page=12, subject="topic", polarity="assert", quote="quote-12")
    claims[13] = _claim(page=13, subject="topic", polarity="deny", quote="quote-13")

    evidence = _evidence([_folio(i, f"page {i+1}") for i in range(14)])

    extractor = _patch_extractor(
        agent,
        {i: [claims[i]] for i in range(14)},
    )
    canon = _patch_canonicaliser(agent, {"topic": "topic"})

    # The detector receives chunks of size 12 with overlap 2. Indices in
    # the prompt are local to the chunk. Capture each chunk and emit a
    # detected pair only for the chunk that actually contains both
    # indices for the contradicting pair (12, 13).
    captured_chunks: list[str] = []

    async def _run(prompt: str, *_a: Any, **_kw: Any) -> _StubResult:
        captured_chunks.append(prompt)
        # Parse claim indices from the prompt's "page=X" markers to find
        # the chunk that contains both pages 13 (1-indexed) and 14.
        # Detector uses 0-indexed local position. The 14-claim bucket is
        # chunked as [0..12) and [10..14), so the pair (12, 13) lives at
        # local indices (2, 3) of the second chunk.
        if "page=13" in prompt and "page=14" in prompt:
            # local indices for pages 13 and 14 within the second chunk
            lines = [
                line
                for line in prompt.splitlines()
                if line.startswith("[") and "]" in line
            ]
            pos_13 = pos_14 = None
            for line in lines:
                # "[N] page=X polarity=..."
                bracket_close = line.index("]")
                local_idx = int(line[1:bracket_close])
                rest = line[bracket_close + 1 :].strip()
                if rest.startswith("page=13 "):
                    pos_13 = local_idx
                if rest.startswith("page=14 "):
                    pos_14 = local_idx
            assert pos_13 is not None and pos_14 is not None
            return _StubResult(
                output=_BucketContradictions(
                    pairs=[
                        _DetectedPair(
                            i=pos_13,
                            j=pos_14,
                            explanation="cross-chunk pair must still be flagged",
                            severity="error",
                        )
                    ]
                )
            )
        return _StubResult(output=_BucketContradictions(pairs=[]))

    detector = patch.object(agent._contradiction_detector, "run", side_effect=_run)
    summary = _patch_summary(agent)

    with extractor, canon, detector, summary:
        verdict = await agent.deliberate(evidence)

    # Multiple chunks must have been emitted.
    assert len(captured_chunks) >= 2
    # And the cross-chunk contradiction must have been caught.
    assert len(verdict.contradictions) == 1
    contradiction = verdict.contradictions[0]
    assert {contradiction.claim1.page, contradiction.claim2.page} == {12, 13}


@pytest.mark.anyio
async def test_canonicaliser_groups_synonyms_into_one_bucket(
    runtime: AppRuntime,
) -> None:
    """When the canonicaliser maps two distinct raw subjects to the same
    canonical phrase, the resulting bucket holds claims from BOTH so the
    detector can find cross-paraphrase contradictions."""
    agent = ContradictionAgent(runtime)
    claim1 = _claim(0, "Q3 revenue", polarity="assert")
    claim2 = _claim(2, "third-quarter sales", polarity="deny")
    evidence = _evidence([_folio(0, "p1"), _folio(2, "p3")])

    extractor = _patch_extractor(agent, {0: [claim1], 2: [claim2]})
    canon = _patch_canonicaliser(
        agent,
        {
            "Q3 revenue": "quarterly revenue",
            "third-quarter sales": "quarterly revenue",
        },
    )

    captured_subjects: list[str] = []

    async def _run(prompt: str, *_a: Any, **_kw: Any) -> _StubResult:
        first = prompt.split("\n", 1)[0]
        captured_subjects.append(first)
        return _StubResult(
            output=_BucketContradictions(
                pairs=[
                    _DetectedPair(
                        i=0,
                        j=1,
                        explanation="Q3 revenue contradicted",
                        severity="error",
                    )
                ]
            )
        )

    detector = patch.object(agent._contradiction_detector, "run", side_effect=_run)
    summary = _patch_summary(agent)

    with extractor, canon, detector, summary:
        verdict = await agent.deliberate(evidence)

    # The detector saw exactly one merged bucket (one canonical subject).
    assert len(captured_subjects) == 1
    assert "quarterly revenue" in captured_subjects[0]
    assert len(verdict.contradictions) == 1


@pytest.mark.anyio
async def test_canonicaliser_failure_falls_back_to_lexical(
    runtime: AppRuntime,
) -> None:
    """If the canonicaliser raises ``AgentRunError``, the agent must fall
    back to the ledger's lexical-only keys without crashing."""
    agent = ContradictionAgent(runtime)
    # Identical lexical subject: both pages will lexically-bucket together.
    claim1 = _claim(0, "deadline", polarity="assert")
    claim2 = _claim(2, "deadline", polarity="deny")
    evidence = _evidence([_folio(0, "p1"), _folio(2, "p3")])

    extractor = _patch_extractor(agent, {0: [claim1], 2: [claim2]})
    canon = _patch_canonicaliser(agent, None)  # raises AgentRunError
    detector = _patch_detector(
        agent,
        {
            "deadline": [
                _DetectedPair(i=0, j=1, explanation="opposed", severity="error"),
            ]
        },
    )
    summary = _patch_summary(agent)

    with extractor, canon, detector, summary:
        verdict = await agent.deliberate(evidence)

    # Lexical key for "deadline" is "deadline" — the agent kept going.
    assert isinstance(verdict, ContradictionVerdict)
    assert len(verdict.contradictions) == 1
    assert verdict.contradictions[0].subject == "deadline"
