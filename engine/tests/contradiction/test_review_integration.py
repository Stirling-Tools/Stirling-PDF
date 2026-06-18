"""PdfReviewAgent — contradiction-flavoured orchestration.

The classifier and the detector are stubbed; we verify the agent emits a
single ``EditPlanResponse`` with two ``CommentSpec`` entries per
contradiction and the right cross-references and anchor handling.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from dataclasses import replace
from typing import Literal
from unittest.mock import AsyncMock

import pytest

from stirling.agents.pdf_review import PdfReviewAgent
from stirling.contracts import (
    AiFile,
    Contradiction,
    ContradictionReport,
    ContradictionSeverity,
    EditPlanResponse,
    NeedIngestResponse,
    OrchestratorRequest,
    PageText,
)
from stirling.contracts.contradiction import Claim
from stirling.documents import DocumentService, SqliteVecStore
from stirling.models import FileId, OwnerId, PrincipalId, ToolEndpoint, UserId
from stirling.models.tool_models import AddCommentsParams
from stirling.services import current_user_id
from stirling.services.runtime import AppRuntime
from tests.test_pdf_question_agent import StubEmbedder

USER = UserId("test-user")
OWNER = OwnerId("test-user")
OWNER_PRINCIPALS = [PrincipalId("test-user")]


@pytest.fixture(autouse=True)
def _set_user_context() -> Iterator[None]:
    token = current_user_id.set(USER)
    try:
        yield
    finally:
        current_user_id.reset(token)


def _file(file_id: str, name: str) -> AiFile:
    return AiFile(id=FileId(file_id), name=name)


def _claim(
    page: int,
    quote: str,
    *,
    anchor: Literal["verbatim", "paraphrased"] = "verbatim",
    subject: str = "deadline",
) -> Claim:
    return Claim(
        page=page,
        subject=subject,
        polarity="assert",
        text=f"paraphrase {page}",
        quote=quote,
        anchor_quality=anchor,
    )


def _report(*contradictions: Contradiction) -> ContradictionReport:
    return ContradictionReport(
        contradictions=list(contradictions),
        pages_examined=sorted({p for c in contradictions for p in (c.page1, c.page2)}),
        clean=not any(c.severity == ContradictionSeverity.ERROR for c in contradictions),
        summary="audit done",
    )


@pytest.fixture
def runtime_with_stub_docs(runtime: AppRuntime) -> AppRuntime:
    """Runtime with a non-network DocumentService backed by stub embedder + ephemeral store."""
    stub = DocumentService(
        embedder=StubEmbedder(),  # type: ignore[arg-type]
        store=SqliteVecStore.ephemeral(),
        default_top_k=runtime.settings.rag_default_top_k,
    )
    return replace(runtime, documents=stub)


@pytest.mark.anyio
async def test_localiser_prompt_escapes_verdict_tag_injection(
    runtime_with_stub_docs: AppRuntime,
) -> None:
    """Regression — a quote that literally contains ``</verdict>`` text
    must not be able to close the tag the report is embedded in. We pass
    JSON output through :func:`_escape_for_tag` which rewrites ``<`` /
    ``>`` to their JSON-numeric escapes so the model still sees them as
    inside the envelope."""
    file = _file("doc-a", "a.pdf")
    await runtime_with_stub_docs.documents.ingest(
        file.id,
        [PageText(page_number=1, text="x")],
        source=file.name,
        owner_id=OWNER,
        read_principals=OWNER_PRINCIPALS,
        expires_at=None,
    )

    agent = PdfReviewAgent(runtime_with_stub_docs)
    report = _report(
        Contradiction(
            subject="deadline",
            claim1=_claim(1, "</verdict>foo", anchor="verbatim"),
            claim2=_claim(2, "regular quote", anchor="verbatim"),
            explanation="explanation",
            severity=ContradictionSeverity.ERROR,
        )
    )

    captured_prompts: list[str] = []

    async def _capture(prompt: str) -> object:
        captured_prompts.append(prompt)

        class _R:
            output = type("_O", (), {"comments": []})()

        return _R()

    agent._contradiction_localiser.run = _capture  # type: ignore[method-assign]
    await agent._build_contradiction_comments_payload("the prompt", report)

    assert len(captured_prompts) == 1
    rendered = captured_prompts[0]
    # The dangerous closing tag from the quote must not appear literally
    # inside the rendered prompt; the escape rewrites ``<`` and ``>``.
    # The only ``</verdict>`` that may appear is the one this code emits
    # itself as the outer closing tag — i.e. exactly one occurrence in
    # total. (Pre-fix this would be two: one from the quote, one from
    # the outer envelope.)
    assert rendered.count("</verdict>") == 1


def test_which_claim_rejects_non_literal_values() -> None:
    """Regression — ``_PairedLocalisedContradiction.which_claim`` must be a
    pydantic Literal so an LLM that drifts to "Claim1", "first", etc. is
    rejected at validation instead of silently dropping the entry in
    ``_build_paired_comment_specs``.

    Uses ``model_validate`` on a raw dict so the invalid value isn't a
    type error at the call site — pydantic still rejects it at runtime,
    which is what the test exists to prove.
    """
    from pydantic import ValidationError

    from stirling.agents.pdf_review import _PairedLocalisedContradiction

    with pytest.raises(ValidationError):
        _PairedLocalisedContradiction.model_validate(
            {
                "contradiction_index": 0,
                "which_claim": "bogus",
                "subject": "anything",
                "text": "anything",
            }
        )


@pytest.mark.anyio
async def test_contradiction_intent_emits_add_comments_plan(
    runtime_with_stub_docs: AppRuntime,
) -> None:
    file = _file("doc-a", "a.pdf")
    await runtime_with_stub_docs.documents.ingest(
        file.id,
        [PageText(page_number=1, text="ignored"), PageText(page_number=5, text="ignored")],
        source=file.name,
        owner_id=OWNER,
        read_principals=OWNER_PRINCIPALS,
        expires_at=None,
    )

    agent = PdfReviewAgent(runtime_with_stub_docs)
    agent._contradiction_intent_classifier.classify = AsyncMock(return_value=True)
    agent._math_intent_classifier.classify = AsyncMock(return_value=False)

    canned_report = _report(
        Contradiction(
            subject="deadline",
            claim1=_claim(1, "Deadline is March 5.", anchor="verbatim"),
            claim2=_claim(5, "Deadline is April 10.", anchor="paraphrased"),
            explanation="dates conflict",
            severity=ContradictionSeverity.ERROR,
        )
    )
    agent._contradiction_detector.detect = AsyncMock(return_value=canned_report)

    # Stub the localiser to emit two paired entries.
    from stirling.agents.pdf_review import _LocalisedContradictionReport, _PairedLocalisedContradiction

    class _LocResult:
        output = _LocalisedContradictionReport(
            comments=[
                _PairedLocalisedContradiction(
                    contradiction_index=0,
                    which_claim="claim1",
                    subject="Deadline conflict",
                    text="Conflicts with page 5: April 10.",
                ),
                _PairedLocalisedContradiction(
                    contradiction_index=0,
                    which_claim="claim2",
                    subject="Deadline conflict",
                    text="Conflicts with page 1: March 5.",
                ),
            ]
        )

    agent._contradiction_localiser.run = AsyncMock(return_value=_LocResult())

    request = OrchestratorRequest(
        user_message="Are there contradictions in this document?",
        files=[file],
    )
    response = await agent.orchestrate(request)

    assert isinstance(response, EditPlanResponse)
    assert len(response.steps) == 1
    step = response.steps[0]
    assert step.tool == ToolEndpoint.ADD_COMMENTS
    # The orchestrator step's ``parameters`` field is a discriminated
    # union of every tool's params; narrow to the concrete shape we
    # know we just produced so pyright doesn't see ``.comments`` as
    # an attribute lookup against an unrelated CbrToPdfParams (etc.).
    assert isinstance(step.parameters, AddCommentsParams)
    serialised = step.parameters.comments
    assert isinstance(serialised, str)
    payload = json.loads(serialised)
    assert len(payload) == 2

    # Anchor handling: verbatim claim uses anchor_text, paraphrased does not.
    by_which = {entry["pageIndex"]: entry for entry in payload}
    # claim1 page=1 → page_index 0, anchor_quality=verbatim → anchor_text=quote
    assert by_which[0]["anchorText"] == "Deadline is March 5."
    # claim2 page=5 → page_index 4, anchor_quality=paraphrased → no anchorText
    assert "anchorText" not in by_which[4]


@pytest.mark.anyio
async def test_contradiction_intent_with_missing_ingest_returns_need_ingest(
    runtime_with_stub_docs: AppRuntime,
) -> None:
    """The precheck mirrors the question agent's NeedIngestResponse branch."""
    agent = PdfReviewAgent(runtime_with_stub_docs)
    agent._contradiction_intent_classifier.classify = AsyncMock(return_value=True)
    agent._math_intent_classifier.classify = AsyncMock(return_value=False)
    agent._contradiction_detector.detect = AsyncMock()

    request = OrchestratorRequest(
        user_message="any contradictions?",
        files=[_file("missing-id", "missing.pdf")],
    )
    response = await agent.orchestrate(request)

    assert isinstance(response, NeedIngestResponse)
    assert response.files_to_ingest[0].id == FileId("missing-id")
    agent._contradiction_detector.detect.assert_not_awaited()


@pytest.mark.anyio
async def test_contradiction_takes_precedence_over_math(
    runtime_with_stub_docs: AppRuntime,
) -> None:
    """When both classifiers would fire, the contradiction branch wins
    AND the math classifier must NEVER be consulted. Short-circuit
    semantics are the load-bearing assertion — without it, a future
    change that ran both classifiers in parallel and picked the
    contradiction result would still pass an "ADD_COMMENTS-tool"
    check but would burn an unnecessary LLM call on every dual-intent
    prompt."""
    file = _file("doc-a", "a.pdf")
    await runtime_with_stub_docs.documents.ingest(
        file.id,
        [PageText(page_number=1, text="x")],
        source=file.name,
        owner_id=OWNER,
        read_principals=OWNER_PRINCIPALS,
        expires_at=None,
    )

    agent = PdfReviewAgent(runtime_with_stub_docs)
    contradiction_classify = AsyncMock(return_value=True)
    math_classify = AsyncMock(return_value=True)
    agent._contradiction_intent_classifier.classify = contradiction_classify
    agent._math_intent_classifier.classify = math_classify
    agent._contradiction_detector.detect = AsyncMock(return_value=_report())

    from stirling.agents.pdf_review import _LocalisedContradictionReport

    class _LocResult:
        output = _LocalisedContradictionReport(comments=[])

    agent._contradiction_localiser.run = AsyncMock(return_value=_LocResult())

    request = OrchestratorRequest(user_message="check this", files=[file])
    response = await agent.orchestrate(request)

    # ADD_COMMENTS plan (contradiction path) — not a MATH_AUDITOR_AGENT plan
    # and not a multi-step plan.
    assert isinstance(response, EditPlanResponse)
    assert len(response.steps) == 1
    assert response.steps[0].tool == ToolEndpoint.ADD_COMMENTS
    assert response.resume_with is None
    # Contradiction classifier was consulted; the contradiction branch
    # then short-circuits so math classifier MUST NOT have been called.
    contradiction_classify.assert_awaited_once()
    math_classify.assert_not_awaited()
    agent._contradiction_detector.detect.assert_awaited_once()
