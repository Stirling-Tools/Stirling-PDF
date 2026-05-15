"""Contradiction detector — orchestrates the five-stage pipeline.

Stage 1 — per-chunk claim extraction via :class:`ChunkedMapper`.
Stage 2 — subject canonicalisation (one fast-model call; lexical fallback).
Stage 3 — pre-filter heuristics (identical-quote, same-page same-polarity).
Stage 4 — per-bucket pair detection (parallel, oversize-aware windowing).
Stage 5 — summary (one fast-model call; deterministic fallback).

The detector never touches PDF files directly: pages arrive via
``runtime.documents.read_pages(file_id)``. Page numbers are 1-indexed
throughout, matching :class:`stirling.contracts.documents.Page`.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Iterator
from typing import Literal

from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.exceptions import AgentRunError

from stirling.agents.contradiction.prompts import (
    CLAIM_EXTRACTOR_PROMPT,
    CONTRADICTION_DETECTOR_PROMPT,
    SUBJECT_CANONICALISER_PROMPT,
    SUMMARY_PROMPT,
)
from stirling.agents.contradiction.validators import ClaimLedger
from stirling.agents.shared.chunked_mapper import ChunkedMapper, ChunkOutput
from stirling.contracts import AiFile
from stirling.contracts.contradiction import (
    Claim,
    Contradiction,
    ContradictionReport,
    ContradictionSeverity,
)
from stirling.contracts.documents import Page
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Internal LLM-output schemas
# ---------------------------------------------------------------------------


class _ExtractedClaim(BaseModel):
    """One claim emitted by the per-chunk claim extractor LLM.

    Carries the page reported by the model. The wrapper validates the
    page against the chunk's coverage before promoting it to a public
    :class:`Claim`.
    """

    page: int = Field(ge=1, description="1-indexed page from the [Page N] marker.")
    subject: str = Field(min_length=1)
    polarity: Literal["assert", "deny", "recommend", "reject", "neutral"]
    text: str = Field(min_length=1)
    quote: str = Field(min_length=1, max_length=400)


class _ExtractedClaims(BaseModel):
    """All claims extracted from a single chunk."""

    claims: list[_ExtractedClaim] = Field(default_factory=list)


class _SubjectMapping(BaseModel):
    """Mapping from raw subject phrases to canonical form per group."""

    mapping: dict[str, str] = Field(default_factory=dict)


class _DetectedPair(BaseModel):
    """One contradicting pair within a bucket of claims."""

    i: int = Field(ge=0)
    j: int = Field(ge=0)
    explanation: str = Field(min_length=1)
    severity: Literal["error", "warning"]


class _BucketContradictions(BaseModel):
    """All contradicting pairs found within one subject bucket."""

    pairs: list[_DetectedPair] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Detector
# ---------------------------------------------------------------------------


class ContradictionDetector:
    """Orchestrates the five-stage textual contradiction pipeline.

    Constructed once per consuming agent (review / question). The
    per-chunk extractor agent and per-bucket detector agent live on the
    detector instance, as does the :class:`ChunkedMapper` that drives
    stage 1.
    """

    def __init__(self, runtime: AppRuntime) -> None:
        self._runtime = runtime
        self._settings = runtime.settings
        fast_model = runtime.fast_model
        model_settings = runtime.fast_model_settings

        self._claim_extractor: Agent[None, _ExtractedClaims] = Agent(
            model=fast_model,
            output_type=_ExtractedClaims,
            system_prompt=CLAIM_EXTRACTOR_PROMPT,
            model_settings=model_settings,
        )
        self._subject_canonicaliser: Agent[None, _SubjectMapping] = Agent(
            model=fast_model,
            output_type=_SubjectMapping,
            system_prompt=SUBJECT_CANONICALISER_PROMPT,
            model_settings=model_settings,
        )
        self._pair_detector: Agent[None, _BucketContradictions] = Agent(
            model=fast_model,
            output_type=_BucketContradictions,
            system_prompt=CONTRADICTION_DETECTOR_PROMPT,
            model_settings=model_settings,
        )
        self._summary_agent: Agent[None, str] = Agent(
            model=fast_model,
            output_type=str,
            system_prompt=SUMMARY_PROMPT,
            model_settings=model_settings,
        )

        self._mapper: ChunkedMapper[_ExtractedClaims] = ChunkedMapper(
            runtime,
            extractor=self._claim_extractor,
            build_prompt=_build_extraction_prompt,
        )

        self._detect_semaphore = asyncio.Semaphore(self._settings.contradiction_detect_concurrency)

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    async def detect(self, files: list[AiFile], query: str | None = None) -> ContradictionReport:
        """Run the full pipeline over the supplied files.

        ``files`` must have already been ingested (the caller is
        responsible for the ``has_collection`` precheck — the question
        agent does this via its existing ``NeedIngestResponse`` branch
        and the review agent does the same before calling).
        """
        logger.info(
            "[contradiction] detect: files=%s query=%r",
            [f.name for f in files],
            query,
        )

        # Stage 0 — load all pages.
        all_pages: list[Page] = []
        for file in files:
            file_pages = await self._runtime.documents.read_pages(file.id)
            if not file_pages:
                logger.info(
                    "[contradiction] no stored pages for %s (id=%s); skipping",
                    file.name,
                    file.id,
                )
                continue
            all_pages.extend(file_pages)

        if not all_pages:
            return self._empty_report(
                summary="No document content was available to audit.",
                clean=True,
                pages_examined=[],
            )

        # Stage 1 — per-chunk claim extraction.
        effective_query = query or "extract claims"
        chunk_outputs = await self._mapper.map_pages(all_pages, effective_query)

        pages_by_num: dict[int, Page] = {p.page_number: p for p in all_pages}
        claims: list[Claim] = []
        pages_with_claims: set[int] = set()
        for chunk in chunk_outputs:
            for raw in chunk.output.claims:
                claim = self._validate_extracted_claim(raw, chunk, pages_by_num)
                if claim is None:
                    continue
                claims.append(claim)
                pages_with_claims.add(claim.page)

        pages_examined = sorted(pages_with_claims)
        logger.info(
            "[contradiction] stage 1: %d valid claim(s) over %d page(s)",
            len(claims),
            len(pages_examined),
        )

        if not claims:
            summary = await self._generate_summary(0, 0, pages_examined)
            return self._empty_report(summary=summary, clean=True, pages_examined=pages_examined)

        # Stage 2 — canonicalise subjects.
        ledger = ClaimLedger()
        for claim in claims:
            ledger.record(claim)

        unique_subjects = ledger.unique_subjects
        if unique_subjects:
            mapping = await self._canonicalise_subjects(unique_subjects)
            if mapping:
                ledger.rekey_with_canonical(mapping)

        # Stage 3+4 — pre-filter + per-bucket detection.
        contradictions = await self._detect_all_buckets(ledger)
        contradictions.sort(key=lambda c: (c.page1, c.page2))

        error_count = sum(1 for c in contradictions if c.severity == ContradictionSeverity.ERROR)
        warning_count = sum(1 for c in contradictions if c.severity == ContradictionSeverity.WARNING)

        # Stage 5 — summary.
        summary = await self._generate_summary(error_count, warning_count, pages_examined)

        return ContradictionReport(
            contradictions=contradictions,
            pages_examined=pages_examined,
            clean=error_count == 0,
            summary=summary,
        )

    # ------------------------------------------------------------------
    # Stage 1 helpers — claim validation
    # ------------------------------------------------------------------

    @staticmethod
    def _validate_extracted_claim(
        raw: _ExtractedClaim,
        chunk: ChunkOutput[_ExtractedClaims],
        pages_by_num: dict[int, Page],
    ) -> Claim | None:
        """Convert an LLM-emitted claim into a public :class:`Claim` after page sanity checks.

        Page traceability rules:

        1. If ``raw.page`` lies inside the chunk's covered pages, accept it.
        2. Else, try a mechanical fallback: search the chunk's pages for the
           quote as a substring. If exactly one matches, reassign ``page``.
        3. Else, drop the claim with a warning.

        Independently, mark the claim as ``verbatim`` iff its quote appears
        as a substring in the declared page's text; otherwise ``paraphrased``.
        """
        if not raw.subject.strip() or not raw.text.strip() or not raw.quote.strip():
            return None

        page = raw.page
        chunk_pages = set(chunk.pages)
        if page not in chunk_pages:
            # Mechanical fallback: find pages in this chunk whose text contains the quote.
            matches = [
                p for p in chunk.pages if p in pages_by_num and raw.quote in pages_by_num[p].text
            ]
            if len(matches) == 1:
                logger.debug(
                    "[contradiction] reassigning claim page %d -> %d via quote search",
                    page,
                    matches[0],
                )
                page = matches[0]
            else:
                logger.warning(
                    "[contradiction] dropping claim with unverifiable page %d (chunk=%s, "
                    "quote-matches=%d)",
                    page,
                    chunk.label,
                    len(matches),
                )
                return None

        page_text = pages_by_num.get(page)
        anchor_quality: Literal["verbatim", "paraphrased"]
        if page_text is not None and raw.quote in page_text.text:
            anchor_quality = "verbatim"
        else:
            anchor_quality = "paraphrased"

        return Claim(
            page=page,
            subject=raw.subject,
            polarity=raw.polarity,
            text=raw.text,
            quote=raw.quote,
            anchor_quality=anchor_quality,
        )

    # ------------------------------------------------------------------
    # Stage 2 helpers — canonicalisation
    # ------------------------------------------------------------------

    async def _canonicalise_subjects(self, subjects: list[str]) -> dict[str, str]:
        """One fast-model call mapping raw subject phrases to canonical forms.

        Returns an empty dict on failure, in which case the ledger keeps
        its lexical-only keys.
        """
        payload = json.dumps(subjects, ensure_ascii=False)
        prompt = f"<subjects>{payload}</subjects>"
        try:
            result = await self._subject_canonicaliser.run(prompt)
            mapping = dict(result.output.mapping)
        except AgentRunError:
            logger.warning(
                "[contradiction] subject canonicalisation failed; falling back to lexical keys",
                exc_info=True,
            )
            return {}

        # Drop entries pointing at empty canonical forms — they would
        # cause the ledger to silently drop claims.
        return {raw: canonical for raw, canonical in mapping.items() if canonical and canonical.strip()}

    # ------------------------------------------------------------------
    # Stage 3+4 helpers — bucket detection
    # ------------------------------------------------------------------

    async def _detect_all_buckets(self, ledger: ClaimLedger) -> list[Contradiction]:
        buckets = ledger.buckets()
        if not buckets:
            return []

        async def _run(canonical: str, claims: list[Claim]) -> list[Contradiction]:
            async with self._detect_semaphore:
                return await self._detect_for_bucket(canonical, claims)

        tasks = [asyncio.create_task(_run(canonical, claims)) for canonical, claims in buckets.items()]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        out: list[Contradiction] = []
        for (canonical, _claims), result in zip(buckets.items(), results, strict=True):
            if isinstance(result, BaseException):
                logger.warning(
                    "[contradiction] bucket detection failed for subject %r: %s",
                    canonical,
                    result,
                )
                continue
            out.extend(result)
        return out

    async def _detect_for_bucket(
        self,
        canonical_subject: str,
        claims: list[Claim],
    ) -> list[Contradiction]:
        """Detect contradictions across all claims sharing one canonical subject.

        Pre-filters obvious non-contradictions before paying for an LLM
        call; chunks oversized buckets into overlapping windows so the
        detector never has to swallow more than ``bucket_chunk_size``
        claims in one call.
        """
        if len(claims) < 2:
            return []

        deduped = self._dedupe_claims_for_detection(claims)
        if len(deduped) < 2:
            return []

        size = self._settings.contradiction_bucket_chunk_size
        overlap = self._settings.contradiction_bucket_chunk_overlap

        seen_pairs: set[tuple[int, int]] = set()
        out: list[Contradiction] = []
        for chunk_start, window in _windows(deduped, size, overlap):
            try:
                pairs = await self._run_detector_chunk(canonical_subject, window)
            except AgentRunError:
                logger.warning(
                    "[contradiction] detector failed for subject %r at chunk_start=%d",
                    canonical_subject,
                    chunk_start,
                    exc_info=True,
                )
                continue

            for pair in pairs:
                if pair.i == pair.j or pair.i < 0 or pair.j < 0:
                    continue
                if pair.i >= len(window) or pair.j >= len(window):
                    continue
                global_i = chunk_start + pair.i
                global_j = chunk_start + pair.j
                lo, hi = sorted((global_i, global_j))
                if lo == hi or (lo, hi) in seen_pairs:
                    continue
                seen_pairs.add((lo, hi))

                claim_lo = deduped[lo]
                claim_hi = deduped[hi]
                # Result-time pre-filter (defence in depth).
                if claim_lo.quote.strip() == claim_hi.quote.strip():
                    continue
                if claim_lo.page == claim_hi.page and claim_lo.polarity == claim_hi.polarity:
                    continue

                severity = (
                    ContradictionSeverity.ERROR if pair.severity == "error" else ContradictionSeverity.WARNING
                )
                out.append(
                    Contradiction(
                        subject=canonical_subject,
                        claim1=claim_lo,
                        claim2=claim_hi,
                        explanation=pair.explanation,
                        severity=severity,
                    )
                )
        return out

    @staticmethod
    def _dedupe_claims_for_detection(claims: list[Claim]) -> list[Claim]:
        """Drop trivial duplicates before sending to the detector.

        Identical (page, normalised quote) pairs collapse to one claim, and
        same-page same-polarity duplicates that say nothing new collapse as
        well. The ledger keeps everything; the detector sees the deduped
        view.
        """
        seen: set[tuple[int, str]] = set()
        out: list[Claim] = []
        for claim in claims:
            key = (claim.page, claim.quote.strip())
            if key in seen:
                continue
            seen.add(key)
            out.append(claim)
        return out

    async def _run_detector_chunk(
        self,
        canonical_subject: str,
        chunk: list[Claim],
    ) -> list[_DetectedPair]:
        """Run the pair detector on a single chunk of claims."""
        rendered_claims = []
        for index, claim in enumerate(chunk):
            rendered_claims.append(
                f"[{index}] page={claim.page} polarity={claim.polarity} "
                f"text={claim.text!r} quote={claim.quote!r}"
            )
        claims_block = "\n".join(rendered_claims)
        prompt = (
            f"Canonical subject: {canonical_subject!r}\n"
            f"<claims>\n{claims_block}\n</claims>"
        )
        result = await self._pair_detector.run(prompt)
        return list(result.output.pairs)

    # ------------------------------------------------------------------
    # Stage 5 helpers — summary
    # ------------------------------------------------------------------

    async def _generate_summary(
        self,
        error_count: int,
        warning_count: int,
        pages_examined: list[int],
    ) -> str:
        verdict_payload = {
            "pagesExamined": len(pages_examined),
            "errors": error_count,
            "warnings": warning_count,
        }
        prompt = f"<verdict>{json.dumps(verdict_payload)}</verdict>"
        try:
            result = await self._summary_agent.run(prompt)
            return result.output
        except AgentRunError:
            logger.warning("[contradiction] summary generation failed; using fallback", exc_info=True)
            return _fallback_summary(error_count, warning_count, pages_examined)

    # ------------------------------------------------------------------
    # Misc helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _empty_report(*, summary: str, clean: bool, pages_examined: list[int]) -> ContradictionReport:
        return ContradictionReport(
            contradictions=[],
            pages_examined=pages_examined,
            clean=clean,
            summary=summary,
        )


# ---------------------------------------------------------------------------
# Module-level helpers
# ---------------------------------------------------------------------------


def _build_extraction_prompt(content: str, query: str) -> str:
    """Wrap chunk content in a <content> tag for the claim extractor.

    Compatible with :class:`ChunkedMapper`'s ``build_prompt`` hook
    (signature ``(content, query) -> str``). The ``query`` argument is
    accepted for protocol compatibility and surfaced in the prompt so
    the same extractor can be reused if a future caller wants to nudge
    extraction; the default is "extract claims" and the extractor's
    system prompt is the load-bearing piece.
    """
    return (
        f"Extraction focus: {query}\n"
        f"<content>\n{content}\n</content>"
    )


def _windows(
    items: list[Claim],
    size: int,
    overlap: int,
) -> Iterator[tuple[int, list[Claim]]]:
    """Yield ``(start_index, window)`` for overlapping windows of ``items``.

    Guarantees every claim appears in at least one window. Buckets with
    ``len <= size`` produce a single full-bucket window. Raises if
    ``overlap`` is not in ``[0, size)``.
    """
    if size <= 0:
        raise ValueError("size must be positive")
    if overlap < 0 or overlap >= size:
        raise ValueError("overlap must be in [0, size)")
    n = len(items)
    if n <= size:
        yield 0, items
        return
    step = size - overlap
    start = 0
    while start < n:
        end = min(start + size, n)
        yield start, items[start:end]
        if end >= n:
            break
        start += step


def _fallback_summary(error_count: int, warning_count: int, pages_examined: list[int]) -> str:
    parts: list[str] = []
    if error_count == 0 and warning_count == 0:
        parts.append(f"No contradictions found across {len(pages_examined)} page(s).")
    else:
        if error_count:
            parts.append(f"Found {error_count} contradiction{'s' if error_count != 1 else ''}.")
        if warning_count:
            parts.append(f"Found {warning_count} possible tension{'s' if warning_count != 1 else ''}.")
        parts.append(f"Pages examined: {len(pages_examined)}.")
    return " ".join(parts)
