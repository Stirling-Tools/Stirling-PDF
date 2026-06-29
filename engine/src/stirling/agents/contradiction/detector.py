"""Contradiction detector — orchestrates the five-stage pipeline.

Stage 1 — per-chunk claim extraction via :class:`ChunkedMapper`.
Stage 2 — subject canonicalisation (one fast-model call; lexical fallback).
Stage 3 — pre-filter heuristics (identical-quote post-filter).
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
from dataclasses import dataclass, field
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
    ClaimPolarity,
    Contradiction,
    ContradictionReport,
    ContradictionSeverity,
)
from stirling.contracts.documents import Page
from stirling.models import PrincipalId
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)


def _escape_for_tag(text: str) -> str:
    """Escape ``<`` / ``>`` so a JSON payload can't prematurely close
    a wrapping XML-style tag (``<verdict>``, ``<subjects>``, ``<claims>``,
    ``<content>``).

    ``json.dumps`` does NOT escape ``<``/``>`` so a PDF that contains
    literal ``"</verdict>"`` text in a quote could otherwise break out of
    the SECURITY-preamble envelope. We rewrite both characters to their
    standard ``\\u003c``/``\\u003e`` JSON escapes, which JSON consumers
    treat as identical to the literals but the tag scanner can't
    recognise as tag delimiters.
    """
    return text.replace("<", "\\u003c").replace(">", "\\u003e")


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
    polarity: ClaimPolarity
    text: str = Field(min_length=1)
    quote: str = Field(min_length=1, max_length=400)


class _ExtractedClaims(BaseModel):
    """All claims extracted from a single chunk."""

    claims: list[_ExtractedClaim] = Field(default_factory=list)


class _SubjectAlias(BaseModel):
    """One ``raw -> canonical`` subject mapping returned by the canonicaliser.

    Splitting the mapping into a typed list lets pydantic reject empty
    canonical forms at validation time, so we can't end up with a silent
    drop because the model returned ``"raw" -> ""``.
    """

    raw: str = Field(min_length=1, description="Original subject phrase exactly as seen on a claim.")
    canonical: str = Field(min_length=1, description="Chosen canonical phrasing for the group.")


class _SubjectMapping(BaseModel):
    """Aliases mapping raw subject phrases to canonical form per group."""

    aliases: list[_SubjectAlias] = Field(default_factory=list)


class _SummaryStats(BaseModel):
    """Stats handed to the summary LLM. Typed (rather than a raw dict
    JSON-dumped at the call site) so the prompt payload's shape lives
    in one place and pyright can catch field-name typos.
    """

    pages_examined: int = Field(ge=0)
    errors: int = Field(ge=0)
    warnings: int = Field(ge=0)


class _DetectedPair(BaseModel):
    """One contradicting pair within a bucket of claims."""

    i: int = Field(ge=0)
    j: int = Field(ge=0)
    explanation: str = Field(min_length=1)
    severity: ContradictionSeverity


class _BucketContradictions(BaseModel):
    """All contradicting pairs found within one subject bucket."""

    pairs: list[_DetectedPair] = Field(default_factory=list)


@dataclass(frozen=True)
class _FileExtractionResult:
    """Per-file output of stage 1.

    ``claims`` are the validated public :class:`Claim` records, already
    tagged with ``file_name``. ``pages_attempted`` is the set of page
    numbers covered by every successful :class:`ChunkOutput` returned by
    the mapper for this file — those are the pages the extractor pass
    ran against, regardless of whether the model produced a claim for
    them. (Chunks that failed contribute nothing here, so the set is a
    coverage record, not an "all pages of the file" assertion.)
    """

    claims: list[Claim] = field(default_factory=list)
    pages_attempted: set[int] = field(default_factory=set)


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

    async def detect(
        self,
        files: list[AiFile],
        principals: list[PrincipalId],
        query: str | None = None,
    ) -> ContradictionReport:
        """Run the full pipeline over the supplied files for ``principals``.

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

        # Stages 0+1 — per-file page load + chunked claim extraction.
        # We MUST keep extraction per-file because concatenating pages
        # across files would create a single ``pages_by_num`` dict where
        # files that share page numbers (typically every PDF) overwrite
        # each other; subsequent quote-substring validation would then
        # check claims against the wrong file's text. Per-file iteration
        # also means each Claim is unambiguously tagged with its source
        # file_name. (Aikido finding on PR #6369.)
        #
        # Files run in parallel — the mapper's internal semaphore still
        # caps total per-chunk concurrency correctly so the LLM pool isn't
        # overcommitted by a wide fan-out.
        effective_query = query or "extract claims"

        per_file_results = await asyncio.gather(
            *(self._extract_claims_for_file(file, effective_query, principals) for file in files),
            return_exceptions=True,
        )

        claims: list[Claim] = []
        pages_attempted: set[tuple[str | None, int]] = set()
        any_pages_seen = False
        for file, result in zip(files, per_file_results, strict=True):
            if isinstance(result, BaseException):
                logger.warning(
                    "[contradiction] per-file extraction failed for %s: %s",
                    file.name,
                    result,
                )
                continue
            if result.pages_attempted:
                any_pages_seen = True
            claims.extend(result.claims)
            pages_attempted.update((file.name, page) for page in result.pages_attempted)

        if not any_pages_seen:
            return self._empty_report(
                summary="No document content was available to audit.",
                pages_examined=[],
            )

        # ``pages_examined`` reports every page the extractor ran against
        # (regardless of whether the model returned a claim for it). Page
        # numbers legitimately repeat across files — page 1 of report.pdf
        # and page 1 of memo.pdf are distinct pages and BOTH were examined.
        # We dedupe on the (file, page) pair, not the page number alone, so
        # multi-file audits don't undercount; the returned list intentionally
        # allows duplicate page numbers when those pages came from different
        # files. Per-file detail is still reachable via each
        # ``Claim.file_name``. (Aikido finding on PR #6369.)
        pages_examined = sorted(page for _file, page in pages_attempted)
        logger.info(
            "[contradiction] stage 1: %d valid claim(s) over %d examined page(s)",
            len(claims),
            len(pages_examined),
        )

        if not claims:
            summary = await self._generate_summary(0, 0, pages_examined)
            return self._empty_report(summary=summary, pages_examined=pages_examined)

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

    async def _extract_claims_for_file(
        self,
        file: AiFile,
        query: str,
        principals: list[PrincipalId],
    ) -> _FileExtractionResult:
        """Run the per-chunk extractor over one file's pages.

        Returns a :class:`_FileExtractionResult` with the validated claims
        and the set of pages whose extraction pass ran. The pages-attempted
        set is the union of pages covered by every successful
        :class:`ChunkOutput`; failed chunks contribute nothing.

        Concurrency across files is governed by the caller's
        ``asyncio.gather`` and the mapper's internal semaphore — this
        helper itself awaits each step sequentially within one file.
        """
        file_pages = await self._runtime.documents.read_pages(file.id, principals=principals)
        if not file_pages:
            logger.info(
                "[contradiction] no stored pages for %s (id=%s); skipping",
                file.name,
                file.id,
            )
            return _FileExtractionResult()

        pages_by_num: dict[int, Page] = {p.page_number: p for p in file_pages}
        chunk_outputs = await self._mapper.map_pages(file_pages, query)

        file_claims: list[Claim] = []
        pages_attempted: set[int] = set()
        for chunk in chunk_outputs:
            pages_attempted.update(chunk.pages)
            # Surface chunks that the extractor returned empty for despite
            # carrying substantial content — a silent zero here usually
            # means the extractor model is misreading the prompt, not that
            # the source page is truly claim-free.
            chunk_char_count = sum(pages_by_num[p].char_count for p in chunk.pages if p in pages_by_num)
            if not chunk.output.claims and chunk_char_count > 500:
                logger.warning(
                    "[contradiction] chunk %s produced 0 claims for %d chars of content",
                    chunk.label,
                    chunk_char_count,
                )
            for raw in chunk.output.claims:
                claim = self._validate_extracted_claim(raw, chunk, pages_by_num, file_name=file.name)
                if claim is None:
                    continue
                file_claims.append(claim)
        return _FileExtractionResult(claims=file_claims, pages_attempted=pages_attempted)

    # ------------------------------------------------------------------
    # Stage 1 helpers — claim validation
    # ------------------------------------------------------------------

    @staticmethod
    def _validate_extracted_claim(
        raw: _ExtractedClaim,
        chunk: ChunkOutput[_ExtractedClaims],
        pages_by_num: dict[int, Page],
        file_name: str | None = None,
    ) -> Claim | None:
        """Convert an LLM-emitted claim into a public :class:`Claim` after page sanity checks.

        ``pages_by_num`` MUST be the page lookup for a single file; passing a
        cross-file aggregate produces wrong substring matches when files share
        page numbers. ``file_name`` is recorded on the returned ``Claim`` so
        downstream consumers can keep claims from different files distinct.

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
            matches = [p for p in chunk.pages if p in pages_by_num and raw.quote in pages_by_num[p].text]
            if len(matches) == 1:
                logger.debug(
                    "[contradiction] reassigning claim page %d -> %d via quote search",
                    page,
                    matches[0],
                )
                page = matches[0]
            else:
                logger.warning(
                    "[contradiction] dropping claim with unverifiable page %d (chunk=%s, quote-matches=%d)",
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
            file_name=file_name,
        )

    # ------------------------------------------------------------------
    # Stage 2 helpers — canonicalisation
    # ------------------------------------------------------------------

    async def _canonicalise_subjects(self, subjects: list[str]) -> dict[str, str]:
        """One or more fast-model calls mapping raw subject phrases to canonical forms.

        Subjects are batched to keep each per-call prompt below the
        model's effective context window. Batches run in parallel under
        the detector's semaphore (shared with bucket detection so we
        don't oversubscribe the LLM pool).

        Returns an empty dict on total failure (every batch raised or
        timed out), in which case the ledger keeps its lexical-only
        keys. Partial failures are tolerated: surviving batches still
        contribute their aliases.

        Internally the canonicaliser produces a typed list of
        ``_SubjectAlias`` records per batch; we collapse them into a
        flat ``dict[str, str]`` for the ledger here so the caller
        doesn't have to know the schema shape. If two batches happen to
        produce different canonicals for the same raw subject, the
        lexicographically smallest canonical wins (deterministic
        tie-breaker).
        """
        if not subjects:
            return {}

        batch_size = self._settings.contradiction_canonicaliser_batch_size
        batches = [subjects[i : i + batch_size] for i in range(0, len(subjects), batch_size)]

        results = await asyncio.gather(
            *(self._canonicalise_batch(batch) for batch in batches),
            return_exceptions=True,
        )

        mapping: dict[str, str] = {}
        for batch_result in results:
            if isinstance(batch_result, BaseException):
                # Already logged at the per-batch site.
                continue
            for raw, canonical in batch_result.items():
                existing = mapping.get(raw)
                # Lowercase-tiebreak ensures repeated batches that map the
                # same ``raw`` to different canonicals settle on a stable
                # value regardless of which batch finished first.
                if existing is None or canonical < existing:
                    mapping[raw] = canonical
        return mapping

    async def _canonicalise_batch(self, subjects: list[str]) -> dict[str, str]:
        """Run the canonicaliser on a single batch of subjects."""
        payload = _escape_for_tag(json.dumps(subjects, ensure_ascii=False))
        prompt = f"<subjects>{payload}</subjects>"
        async with self._detect_semaphore:
            try:
                result = await asyncio.wait_for(
                    self._subject_canonicaliser.run(prompt),
                    timeout=self._settings.chunked_reasoner_worker_timeout_seconds,
                )
            except (AgentRunError, TimeoutError):
                logger.warning(
                    "[contradiction] subject canonicalisation batch failed; subjects fall back to lexical keys",
                    exc_info=True,
                )
                return {}

        # Pydantic already guarantees ``raw`` and ``canonical`` are
        # ``min_length=1`` non-empty strings, but be defensive in case
        # the model returned a whitespace-only canonical form: an empty
        # canonical would cause the ledger to silently drop claims.
        batch_mapping: dict[str, str] = {}
        for alias in result.output.aliases:
            if not alias.canonical.strip():
                continue
            batch_mapping[alias.raw] = alias.canonical
        return batch_mapping

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
            except (AgentRunError, TimeoutError):
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
                # Identical-quote pairs are detector self-pairings, not
                # contradictions. Paraphrase detection (different quotes,
                # same fact) is the detector prompt's job.
                if claim_lo.quote.strip() == claim_hi.quote.strip():
                    continue

                out.append(
                    Contradiction(
                        subject=canonical_subject,
                        claim1=claim_lo,
                        claim2=claim_hi,
                        explanation=pair.explanation,
                        severity=pair.severity,
                    )
                )
        return out

    @staticmethod
    def _dedupe_claims_for_detection(claims: list[Claim]) -> list[Claim]:
        """Collapse claims with the same ``(file_name, page, quote)`` to one.

        The ledger keeps everything; the detector sees the deduped view.
        ``file_name`` is in the key so multi-file audits don't collapse
        claims that share a page number across different source files.
        """
        seen: set[tuple[str | None, int, str]] = set()
        out: list[Claim] = []
        for claim in claims:
            key = (claim.file_name, claim.page, claim.quote.strip())
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
        """Run the pair detector on a single chunk of claims.

        Each claim is rendered as a one-line JSON object inside the
        ``<claims>`` envelope so newlines and quotes inside the
        user-supplied text are unambiguously delimited. The whole block
        is also passed through :func:`_escape_for_tag` so a literal
        ``"</claims>"`` inside a quote can't close the envelope.
        """
        # Use ``Claim.model_dump_json`` (with the same field subset the
        # detector cares about) rather than a hand-rolled dict + json.dumps.
        # The model is the source of truth for these field names so a future
        # rename can't desynchronise the prompt schema from the rest of the
        # pipeline.
        rendered_claims = [
            f"[{index}] " + claim.model_dump_json(include={"page", "polarity", "text", "quote"})
            for index, claim in enumerate(chunk)
        ]
        claims_block = _escape_for_tag("\n".join(rendered_claims))
        prompt = f"Canonical subject: {canonical_subject!r}\n<claims>\n{claims_block}\n</claims>"
        # Mirror the per-chunk timeout used by ChunkedMapper so a single
        # stalled provider call can't pin the whole detect() to the HTTP
        # default.
        result = await asyncio.wait_for(
            self._pair_detector.run(prompt),
            timeout=self._settings.chunked_reasoner_worker_timeout_seconds,
        )
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
        stats = _SummaryStats(
            pages_examined=len(pages_examined),
            errors=error_count,
            warnings=warning_count,
        )
        # ``ApiModel.model_dump_json`` would emit camelCase via the
        # configured serialiser; ``_SummaryStats`` is an internal
        # ``BaseModel`` (LLM prompt payload only — not on the wire)
        # so plain ``model_dump_json`` keeps the keys snake_case,
        # which is exactly what the summary system prompt expects.
        prompt = f"<verdict>{_escape_for_tag(stats.model_dump_json())}</verdict>"
        try:
            result = await asyncio.wait_for(
                self._summary_agent.run(prompt),
                timeout=self._settings.chunked_reasoner_worker_timeout_seconds,
            )
            return result.output
        except (AgentRunError, TimeoutError):
            logger.warning(
                "[contradiction] summary generation failed (provider error or timeout); using fallback",
                exc_info=True,
            )
            return _fallback_summary(error_count, warning_count, pages_examined)

    # ------------------------------------------------------------------
    # Misc helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _empty_report(*, summary: str, pages_examined: list[int]) -> ContradictionReport:
        """Build a contradictions-free report.

        Always ``clean=True`` — every existing caller of this helper enters
        through a "no claims" / "no pages" branch and never produced any
        contradictions to begin with, so the result cannot contain an
        ERROR-severity finding.
        """
        return ContradictionReport(
            contradictions=[],
            pages_examined=pages_examined,
            clean=True,
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
    return f"Extraction focus: {query}\n<content>\n{content}\n</content>"


def _windows(
    items: list[Claim],
    size: int,
    overlap: int,
) -> Iterator[tuple[int, list[Claim]]]:
    """Yield ``(start_index, window)`` for overlapping windows of ``items``.

    Guarantees every claim appears in at least one window. Buckets with
    ``len <= size`` produce a single full-bucket window. Raises if
    ``overlap`` is not in ``[0, size)``.

    Cross-window reach: pairs whose global indices are more than
    ``size`` apart are never offered to the detector together. With
    the default ``chunk_size=12, overlap=2`` the effective
    contradiction reach within a single subject bucket is roughly 10
    claims (``size - overlap``). Oversized buckets where the model
    might want to relate claim 1 with claim 50 should be considered an
    approximation; the windowing trades that recall for bounded prompt
    size.
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
