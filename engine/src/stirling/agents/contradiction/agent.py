"""
Contradiction Agent — pydantic-ai agents for textual contradiction detection.

Examiner  (Round 1, /api/v1/ai/contradiction-agent/examine)
    Receives a FolioManifest and returns a Requisition declaring what
    Java must extract before deliberation can begin. Tables are never
    requested — textual contradictions live in prose.

Deliberation  (Round 2, /api/v1/ai/contradiction-agent/deliberate)
    Processes Evidence in parallel:
      1. Per-page claim extraction (LLM, bounded by extract semaphore)
      2. Subject canonicalisation (single LLM call, falls back to
         lexical normalisation on failure)
      3. Pre-filter heuristics (drop identical quotes; drop same-page
         same-polarity pairs to deduplicate paraphrases)
      4. Per-bucket batched contradiction detection (LLM, bounded by
         detect semaphore). Buckets > N claims are split into
         overlapping windows so no claim is silently dropped.
      5. Summary fast-model call (with deterministic fallback)
      6. Assemble ContradictionVerdict programmatically

Neither agent ever touches a PDF file. All content arrives pre-extracted
by Java, which owns the PDF from start to finish.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Literal

from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.exceptions import AgentRunError

from stirling.agents._concurrency import throttled
from stirling.contracts.contradiction import (
    Claim,
    Contradiction,
    ContradictionSeverity,
    ContradictionVerdict,
    Evidence,
    Folio,
    FolioManifest,
    Requisition,
)
from stirling.logging import Pretty
from stirling.services import AppRuntime

from .prompts import (
    CLAIM_EXTRACTOR_PROMPT,
    CONTRADICTION_DETECTOR_PROMPT,
    EXAMINER_SYSTEM_PROMPT,
    SUBJECT_CANONICALISER_PROMPT,
    SUMMARY_PROMPT,
)
from .validators import ClaimLedger

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------

# Maximum number of claims fed to a single contradiction-detector call.
# Buckets larger than this are split into overlapping windows so every
# claim is still considered.
_BUCKET_CHUNK_SIZE = 12
# Overlap between adjacent windows to catch contradictions that straddle
# the chunk boundary.
_BUCKET_CHUNK_OVERLAP = 2


# ---------------------------------------------------------------------------
# Structured output models for the per-page LLM agents
# ---------------------------------------------------------------------------


class _ClaimExtractionResult(BaseModel):
    """All atomic claims extracted from a single page."""

    claims: list[Claim] = Field(default_factory=list)


class _SubjectCanonicalisationResult(BaseModel):
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
# ContradictionAgent — instantiated once at startup
# ---------------------------------------------------------------------------


class ContradictionAgent:
    """Encapsulates the textual contradiction-detection pipeline.

    Instantiated once at app startup with an :class:`AppRuntime`, which
    provides pre-built ``Model`` objects and ``ModelSettings``.
    """

    def __init__(self, runtime: AppRuntime) -> None:
        fast_model = runtime.fast_model
        model_settings = runtime.fast_model_settings
        self._runtime = runtime
        self._examiner: Agent[FolioManifest, Requisition] = Agent(
            model=fast_model,
            deps_type=FolioManifest,
            output_type=Requisition,
            system_prompt=EXAMINER_SYSTEM_PROMPT,
            model_settings=model_settings,
        )
        self._claim_extractor: Agent[None, _ClaimExtractionResult] = Agent(
            model=fast_model,
            output_type=_ClaimExtractionResult,
            system_prompt=CLAIM_EXTRACTOR_PROMPT,
            model_settings=model_settings,
        )
        self._subject_canonicaliser: Agent[None, _SubjectCanonicalisationResult] = Agent(
            model=fast_model,
            output_type=_SubjectCanonicalisationResult,
            system_prompt=SUBJECT_CANONICALISER_PROMPT,
            model_settings=model_settings,
        )
        self._contradiction_detector: Agent[None, _BucketContradictions] = Agent(
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
        # Two semaphores so detection cannot starve extraction.
        self._extract_semaphore = asyncio.Semaphore(10)
        self._detect_semaphore = asyncio.Semaphore(5)

    # ------------------------------------------------------------------
    # Round 1: Examine
    # ------------------------------------------------------------------

    async def examine(self, manifest: FolioManifest) -> Requisition:
        """Inspect a FolioManifest and declare the Requisition.

        The examiner prompt forbids requesting tables; even if the LLM
        somehow includes a table page, we strip it before returning so
        Java never wastes Tabula extraction on this agent.
        """
        logger.info(
            "[contradiction-agent] session=%s round=%d examining %d folios",
            manifest.session_id,
            manifest.round,
            manifest.page_count,
        )

        user_prompt = "Examine this folio manifest and declare your requisition:\n" + manifest.model_dump_json()
        logger.debug("REQUEST (examine)\n%s", Pretty({"user_prompt": user_prompt}))

        result = await self._examiner.run(user_prompt, deps=manifest)
        req = result.output

        # Defensive enforcement: never request tables for textual contradictions.
        if req.need_tables:
            logger.debug(
                "[contradiction-agent] dropping %d table requests from examiner output",
                len(req.need_tables),
            )
            req = req.model_copy(update={"need_tables": []})

        logger.debug("RESPONSE (examine)\n%s", Pretty(req.model_dump()))
        logger.info(
            "[contradiction-agent] session=%s requisition: text=%s tables=%s ocr=%s",
            manifest.session_id,
            req.need_text,
            req.need_tables,
            req.need_ocr,
        )
        return req

    # ------------------------------------------------------------------
    # Round 2: Deliberate
    # ------------------------------------------------------------------

    async def deliberate(self, evidence: Evidence) -> ContradictionVerdict:
        """Audit the evidence and return a :class:`ContradictionVerdict`."""
        logger.info(
            "[contradiction-agent] session=%s round=%d deliberating %d folios (final=%s)",
            evidence.session_id,
            evidence.round,
            len(evidence.folios),
            evidence.final_round,
        )

        # Step 1: Filter folios with non-empty readable text.
        # `pages_examined` reports pages whose claims were actually checked
        # (i.e. that reached the claim extractor). Folios arriving with
        # empty text are excluded — they're either blank or covered by
        # `unauditable_pages` if extraction failed upstream. See the
        # ContradictionVerdict.pages_examined docstring for the contract.
        folios_with_text: list[Folio] = [f for f in evidence.folios if f.readable_text.strip()]
        pages_examined: list[int] = sorted(f.page for f in folios_with_text)

        if not folios_with_text:
            logger.info(
                "[contradiction-agent] session=%s no readable text on any folio; returning clean verdict",
                evidence.session_id,
            )
            summary = self._fallback_summary(0, 0, pages_examined, evidence.unauditable_pages)
            return ContradictionVerdict(
                session_id=evidence.session_id,
                contradictions=[],
                pages_examined=pages_examined,
                rounds_taken=evidence.round,
                summary=summary,
                clean=True,
                unauditable_pages=evidence.unauditable_pages,
            )

        # Step 2: Per-page parallel claim extraction.
        logger.info(
            "[contradiction-agent] session=%s step 2: extracting claims from %d pages (parallel, max=%d)",
            evidence.session_id,
            len(folios_with_text),
            self._extract_semaphore._value,  # advisory — initial value
        )
        extraction_results = await asyncio.gather(
            *[
                throttled(self._extract_claims_for_page(folio), self._extract_semaphore)
                for folio in folios_with_text
            ],
            return_exceptions=True,
        )

        # Step 3: Feed extracted claims into the ledger.
        ledger = ClaimLedger()
        for folio, result in zip(folios_with_text, extraction_results, strict=True):
            if isinstance(result, BaseException):
                logger.warning(
                    "[contradiction-agent] claim extraction failed for page %d: %s",
                    folio.page,
                    result,
                )
                continue
            assert isinstance(result, list)
            for claim in result:
                ledger.record(claim)

        logger.info(
            "[contradiction-agent] session=%s step 2 complete: %d claims registered",
            evidence.session_id,
            ledger.entry_count,
        )

        # Step 4: Subject canonicalisation (one LLM call). Failure is
        # non-fatal — we keep the lexical-only keys.
        unique_subjects = ledger.unique_subjects
        if unique_subjects:
            mapping = await self._canonicalise_subjects(unique_subjects)
            if mapping:
                ledger.rekey_with_canonical(mapping)

        # Step 5+6: Pre-filter pairs and run per-bucket detection.
        buckets = ledger.buckets()
        logger.info(
            "[contradiction-agent] session=%s step 5: %d candidate buckets",
            evidence.session_id,
            len(buckets),
        )

        contradictions: list[Contradiction] = []
        if buckets:
            bucket_items = list(buckets.items())
            bucket_results = await asyncio.gather(
                *[
                    throttled(
                        self._detect_for_bucket(canonical_subject, claims),
                        self._detect_semaphore,
                    )
                    for canonical_subject, claims in bucket_items
                ],
                return_exceptions=True,
            )

            for (canonical_subject, claims), result in zip(bucket_items, bucket_results, strict=True):
                if isinstance(result, BaseException):
                    logger.warning(
                        "[contradiction-agent] contradiction detection failed for subject %r: %s",
                        canonical_subject,
                        result,
                    )
                    continue
                assert isinstance(result, list)
                contradictions.extend(result)

        # Step 7: Sort by (page1, page2) for stable output.
        contradictions.sort(key=lambda c: (c.page1, c.page2))

        # Step 8: Summary.
        error_count = sum(1 for c in contradictions if c.severity == ContradictionSeverity.ERROR)
        warning_count = sum(1 for c in contradictions if c.severity == ContradictionSeverity.WARNING)
        logger.info(
            "[contradiction-agent] session=%s step 8: generating summary (%d contradictions)",
            evidence.session_id,
            len(contradictions),
        )
        summary = await self._generate_summary(
            contradictions,
            pages_examined,
            evidence.unauditable_pages,
            ledger.entry_count,
        )

        verdict = ContradictionVerdict(
            session_id=evidence.session_id,
            contradictions=contradictions,
            pages_examined=pages_examined,
            rounds_taken=evidence.round,
            summary=summary,
            clean=error_count == 0,
            unauditable_pages=evidence.unauditable_pages,
        )

        logger.debug("RESPONSE (deliberate)\n%s", Pretty(verdict.model_dump()))
        logger.info(
            "[contradiction-agent] session=%s verdict: %d errors, %d warnings, clean=%s",
            evidence.session_id,
            error_count,
            warning_count,
            verdict.clean,
        )
        return verdict

    # ------------------------------------------------------------------
    # Internal helpers — claim extraction
    # ------------------------------------------------------------------

    async def _extract_claims_for_page(self, folio: Folio) -> list[Claim]:
        """Ask the fast model to extract atomic claims from one page.

        Empty pages and LLM failures degrade to an empty list — they are
        not fatal; the rest of the document still gets audited.
        """
        text = folio.readable_text
        if not text.strip():
            return []

        logger.info(
            "[contradiction-agent] extracting claims from page %d (%d chars)",
            folio.page,
            len(text),
        )
        prompt = f"Page {folio.page + 1} text:\n{text}"
        try:
            result = await self._claim_extractor.run(prompt)
            extracted = result.output.claims
        except AgentRunError:
            logger.warning(
                "[contradiction-agent] claim extraction failed for page %d, skipping",
                folio.page,
                exc_info=True,
            )
            return []

        # The LLM may emit a placeholder page index; force-correct it so
        # downstream code never disagrees with the folio it actually came
        # from. Likewise drop any claim missing required text fields.
        normalised: list[Claim] = []
        for claim in extracted:
            if not claim.text.strip() or not claim.quote.strip() or not claim.subject.strip():
                continue
            if claim.page != folio.page:
                claim = claim.model_copy(update={"page": folio.page})
            normalised.append(claim)

        logger.debug(
            "TOOL (extract_claims)\nArgs: %s\nResult: %s",
            Pretty({"page": folio.page, "text_length": len(text)}),
            Pretty([c.model_dump() for c in normalised]),
        )
        return normalised

    # ------------------------------------------------------------------
    # Internal helpers — canonicalisation
    # ------------------------------------------------------------------

    async def _canonicalise_subjects(self, subjects: list[str]) -> dict[str, str]:
        """One fast-model call mapping raw subject phrases to canonical forms.

        Returns an empty dict on failure, in which case the ledger keeps
        its lexical-only keys.
        """
        prompt = "Subjects:\n" + json.dumps(subjects, ensure_ascii=False)
        try:
            result = await self._subject_canonicaliser.run(prompt)
            mapping = dict(result.output.mapping)
        except AgentRunError:
            logger.warning(
                "[contradiction-agent] subject canonicalisation failed; falling back to lexical keys",
                exc_info=True,
            )
            return {}

        # Drop entries pointing at empty canonical forms — they would
        # cause the ledger to silently drop claims.
        cleaned = {raw: canonical for raw, canonical in mapping.items() if canonical and canonical.strip()}
        logger.debug(
            "TOOL (canonicalise_subjects)\nArgs: %s\nResult: %s",
            Pretty({"subjects": subjects}),
            Pretty(cleaned),
        )
        return cleaned

    # ------------------------------------------------------------------
    # Internal helpers — contradiction detection
    # ------------------------------------------------------------------

    async def _detect_for_bucket(
        self,
        canonical_subject: str,
        claims: list[Claim],
    ) -> list[Contradiction]:
        """Detect contradictions across all claims sharing one canonical subject.

        Pre-filters obvious non-contradictions before paying for an LLM
        call; chunks oversized buckets into overlapping windows so the
        detector never has to swallow a > _BUCKET_CHUNK_SIZE list.
        """
        if len(claims) < 2:
            return []

        # Pre-filter: drop pairs with identical quote and same-page
        # same-polarity duplicates. We do this by grouping rather than
        # by removing claims so we still consider every distinct claim.
        deduped = self._dedupe_claims_for_detection(claims)
        if len(deduped) < 2:
            return []

        # Detect within each chunk and dedupe results across overlapping
        # chunks by frozen pair indices.
        all_results: list[Contradiction] = []
        seen_pairs: set[tuple[int, int]] = set()
        for chunk_start, chunk in self._chunked(deduped, _BUCKET_CHUNK_SIZE, _BUCKET_CHUNK_OVERLAP):
            try:
                pairs = await self._run_detector_chunk(canonical_subject, chunk)
            except AgentRunError:
                logger.warning(
                    "[contradiction-agent] detector failed for subject %r chunk starting at %d",
                    canonical_subject,
                    chunk_start,
                    exc_info=True,
                )
                continue

            for pair in pairs:
                local_i, local_j = pair.i, pair.j
                if local_i == local_j or local_i < 0 or local_j < 0:
                    continue
                if local_i >= len(chunk) or local_j >= len(chunk):
                    continue
                global_i = chunk_start + local_i
                global_j = chunk_start + local_j
                if global_i == global_j:
                    continue
                lo, hi = sorted((global_i, global_j))
                if (lo, hi) in seen_pairs:
                    continue
                seen_pairs.add((lo, hi))

                claim_lo = deduped[lo]
                claim_hi = deduped[hi]
                # Pre-filter at result-time too: identical quotes are not
                # contradictions, just duplicate sightings.
                if claim_lo.quote.strip() == claim_hi.quote.strip():
                    continue
                if (
                    claim_lo.page == claim_hi.page
                    and claim_lo.polarity == claim_hi.polarity
                ):
                    continue

                severity = (
                    ContradictionSeverity.ERROR
                    if pair.severity == "error"
                    else ContradictionSeverity.WARNING
                )
                all_results.append(
                    Contradiction(
                        subject=canonical_subject,
                        claim1=claim_lo,
                        claim2=claim_hi,
                        explanation=pair.explanation,
                        severity=severity,
                    )
                )

        logger.debug(
            "TOOL (detect_contradictions)\nArgs: %s\nResult: %s",
            Pretty({"subject": canonical_subject, "claim_count": len(deduped)}),
            Pretty([c.model_dump() for c in all_results]),
        )
        return all_results

    @staticmethod
    def _dedupe_claims_for_detection(claims: list[Claim]) -> list[Claim]:
        """Drop trivial duplicates before sending to the detector.

        Identical quotes on the same page collapse to a single claim. We
        keep one representative per (page, normalised quote) pair to
        avoid wasting the detector on paraphrase noise.
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

    @staticmethod
    def _chunked(
        items: list[Claim],
        size: int,
        overlap: int,
    ):
        """Yield ``(start_index, window)`` for overlapping windows of ``items``.

        Guarantees every claim appears in at least one window. Buckets
        with ``len <= size`` produce a single full-bucket window.
        """
        if size <= 0:
            raise ValueError("chunk size must be positive")
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

    async def _run_detector_chunk(
        self,
        canonical_subject: str,
        chunk: list[Claim],
    ) -> list[_DetectedPair]:
        """Run the contradiction detector on a single chunk of claims."""
        rendered = []
        for index, claim in enumerate(chunk):
            rendered.append(
                f"[{index}] page={claim.page + 1} polarity={claim.polarity} "
                f"text={claim.text!r} quote={claim.quote!r}"
            )
        prompt = (
            f"Canonical subject: {canonical_subject}\n"
            "Claims (numbered, all share the same subject):\n"
            + "\n".join(rendered)
        )
        result = await self._contradiction_detector.run(prompt)
        return list(result.output.pairs)

    # ------------------------------------------------------------------
    # Internal helpers — summary
    # ------------------------------------------------------------------

    async def _generate_summary(
        self,
        contradictions: list[Contradiction],
        pages_examined: list[int],
        unauditable_pages: list[int],
        claim_count: int,
    ) -> str:
        error_count = sum(1 for c in contradictions if c.severity == ContradictionSeverity.ERROR)
        warning_count = sum(1 for c in contradictions if c.severity == ContradictionSeverity.WARNING)

        prompt = (
            f"Pages examined: {len(pages_examined)}, "
            f"Claims considered: {claim_count}, "
            f"Errors: {error_count}, Warnings: {warning_count}, "
            f"Unauditable pages: {unauditable_pages or 'none'}.\n"
        )
        if contradictions:
            prompt += "Contradictions:\n"
            for c in contradictions:
                prompt += (
                    f"  - [{c.severity}] subject={c.subject!r} "
                    f"p{c.page1 + 1}↔p{c.page2 + 1}: {c.explanation}\n"
                )

        try:
            result = await self._summary_agent.run(prompt)
            summary = result.output
        except AgentRunError:
            logger.warning(
                "[contradiction-agent] summary generation failed, using fallback",
                exc_info=True,
            )
            summary = self._fallback_summary(error_count, warning_count, pages_examined, unauditable_pages)

        logger.debug("RESPONSE (summary)\n%s", Pretty({"summary": summary}))
        return summary

    @staticmethod
    def _fallback_summary(
        error_count: int,
        warning_count: int,
        pages_examined: list[int],
        unauditable_pages: list[int],
    ) -> str:
        parts: list[str] = []
        if error_count == 0 and warning_count == 0:
            parts.append(f"No contradictions found across {len(pages_examined)} pages.")
        else:
            if error_count:
                parts.append(f"Found {error_count} contradiction{'s' if error_count != 1 else ''}.")
            if warning_count:
                parts.append(
                    f"Found {warning_count} possible tension{'s' if warning_count != 1 else ''}."
                )
        if unauditable_pages:
            parts.append(
                f"Pages {', '.join(str(p + 1) for p in unauditable_pages)} could not be audited (OCR unavailable)."
            )
        return " ".join(parts)
