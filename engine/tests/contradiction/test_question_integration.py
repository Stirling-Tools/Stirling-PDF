"""PdfQuestionAgent — contradiction capability wiring.

The smart-model agent picks the right tool based on the question; here
we don't drive the smart model — we directly verify that the agent
wires the contradiction capability into its toolset alongside RAG and
the whole-document reader, and that the capability dispatches to the
detector when invoked.
"""

from __future__ import annotations

from dataclasses import replace
from unittest.mock import AsyncMock

import pytest

from stirling.agents.contradiction import ContradictionCapability
from stirling.agents.pdf_questions import PdfQuestionAgent
from stirling.contracts import (
    AiFile,
    ContradictionReport,
    PageText,
    PdfQuestionRequest,
)
from stirling.contracts.contradiction import (
    Claim,
    Contradiction,
    ContradictionSeverity,
)
from stirling.documents import DocumentService, SqliteVecStore
from stirling.models import FileId
from stirling.services.runtime import AppRuntime
from tests.test_pdf_question_agent import StubEmbedder


def _file(file_id: str, name: str) -> AiFile:
    return AiFile(id=FileId(file_id), name=name)


def _claim(page: int, quote: str) -> Claim:
    return Claim(
        page=page,
        subject="deadline",
        polarity="assert",
        text=f"paraphrase {page}",
        quote=quote,
    )


@pytest.fixture
def runtime_with_stub_docs(runtime: AppRuntime) -> AppRuntime:
    stub = DocumentService(
        embedder=StubEmbedder(),  # type: ignore[arg-type]
        store=SqliteVecStore.ephemeral(),
        default_top_k=runtime.settings.rag_default_top_k,
    )
    return replace(runtime, documents=stub)


@pytest.mark.anyio
async def test_run_answer_agent_builds_agent_with_three_toolsets(
    runtime_with_stub_docs: AppRuntime,
) -> None:
    """``_run_answer_agent`` constructs an ``Agent`` with all three retrieval
    toolsets (rag, whole-doc, contradiction). We intercept the Agent
    constructor and inspect what was wired."""
    file = _file("doc-a", "a.pdf")
    await runtime_with_stub_docs.documents.ingest(
        file.id, [PageText(page_number=1, text="content")], source=file.name,
    )

    agent = PdfQuestionAgent(runtime_with_stub_docs)

    captured: dict[str, object] = {}

    import pydantic_ai

    real_agent_init = pydantic_ai.Agent.__init__
    real_agent_run = pydantic_ai.Agent.run

    def _capture_init(self: object, *args: object, **kwargs: object) -> None:
        captured["toolsets"] = kwargs.get("toolsets")
        captured["instructions"] = kwargs.get("instructions")
        # Call the real init for safety.
        real_agent_init(self, *args, **kwargs)  # type: ignore[misc]

    # Stub the agent's `.run` so we don't reach a real model.
    async def _stub_run(self: object, *args: object, **kwargs: object) -> object:
        class _Result:
            output = "stubbed"
        return _Result()

    pydantic_ai.Agent.__init__ = _capture_init  # type: ignore[method-assign]
    pydantic_ai.Agent.run = _stub_run  # type: ignore[method-assign]
    try:
        await agent._run_answer_agent(PdfQuestionRequest(question="any conflicts?", files=[file]))
    finally:
        pydantic_ai.Agent.__init__ = real_agent_init  # type: ignore[method-assign]
        pydantic_ai.Agent.run = real_agent_run  # type: ignore[method-assign]

    toolsets = captured.get("toolsets")
    assert isinstance(toolsets, list)
    assert len(toolsets) == 3  # rag + whole-doc + contradiction


@pytest.mark.anyio
async def test_contradiction_capability_returns_report_text_when_invoked(
    runtime_with_stub_docs: AppRuntime,
) -> None:
    """When the smart model calls ``find_contradictions``, the capability
    invokes the detector and returns notes-style text containing the
    canned report's quotes."""
    file = _file("doc-a", "a.pdf")
    await runtime_with_stub_docs.documents.ingest(
        file.id, [PageText(page_number=1, text="x")], source=file.name,
    )

    agent = PdfQuestionAgent(runtime_with_stub_docs)
    canned = ContradictionReport(
        contradictions=[
            Contradiction(
                subject="deadline",
                claim1=_claim(1, "Deadline March 5."),
                claim2=_claim(7, "Deadline April 10."),
                explanation="dates conflict",
                severity=ContradictionSeverity.ERROR,
            )
        ],
        pages_examined=[1, 7],
        clean=False,
        summary="examined 2 pages; 1 contradiction",
    )
    agent._contradiction_detector.detect = AsyncMock(return_value=canned)  # type: ignore[method-assign]

    capability = ContradictionCapability(detector=agent._contradiction_detector, files=[file])
    result = await capability._find_contradictions("are there conflicts?")

    assert "Deadline March 5." in result
    assert "Deadline April 10." in result
    assert "examined 2 pages" in result.lower()
