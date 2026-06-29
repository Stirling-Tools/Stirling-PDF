"""PdfQuestionAgent — contradiction capability wiring.

The smart-model agent picks the right tool based on the question; here
we don't drive the smart model — we directly verify that the agent
wires the contradiction capability into its toolset alongside RAG and
the whole-document reader, and that the capability dispatches to the
detector when invoked.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import replace

import pytest
from pydantic_ai.toolsets import FunctionToolset

from stirling.agents.pdf_questions import PdfQuestionAgent
from stirling.contracts import (
    AiFile,
    PageText,
    PdfQuestionRequest,
)
from stirling.contracts.contradiction import Claim
from stirling.documents import DocumentService, SqliteVecStore
from stirling.models import FileId, OwnerId, PrincipalId, UserId
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
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``_run_answer_agent`` constructs an ``Agent`` with all three retrieval
    toolsets (rag, whole-doc, contradiction). We intercept the Agent
    constructor and inspect what was wired.

    Uses pytest's ``monkeypatch`` fixture rather than direct attribute
    assignment so pyright sees the swap as a typed test-only operation
    and restoration is automatic if the test raises.
    """
    file = _file("doc-a", "a.pdf")
    await runtime_with_stub_docs.documents.ingest(
        file.id,
        [PageText(page_number=1, text="content")],
        source=file.name,
        owner_id=OWNER,
        read_principals=OWNER_PRINCIPALS,
        expires_at=None,
    )

    agent = PdfQuestionAgent(runtime_with_stub_docs)

    captured: dict[str, object] = {}

    import pydantic_ai

    real_agent_init = pydantic_ai.Agent.__init__

    # The Agent class is generic on deps/output types — its __init__ accepts
    # arbitrary positional+keyword arguments depending on those parameters.
    # We're monkey-patching the class itself for one test, so the bound
    # method's signature is intentionally opaque here. Typing through Any
    # is honest about that boundary ("we can't statically describe it")
    # and avoids wallpapering the body with type-ignore directives.
    from typing import Any

    def _capture_init(self: Any, *args: Any, **kwargs: Any) -> None:
        captured["toolsets"] = kwargs.get("toolsets")
        captured["instructions"] = kwargs.get("instructions")
        # Call the real init for safety.
        real_agent_init(self, *args, **kwargs)

    # Stub the agent's `.run` so we don't reach a real model.
    async def _stub_run(self: Any, *args: Any, **kwargs: Any) -> object:
        class _Result:
            output = "stubbed"

        return _Result()

    monkeypatch.setattr(pydantic_ai.Agent, "__init__", _capture_init)
    monkeypatch.setattr(pydantic_ai.Agent, "run", _stub_run)
    await agent._run_answer_agent(PdfQuestionRequest(question="any conflicts?", files=[file]))

    toolsets = captured.get("toolsets")
    assert isinstance(toolsets, list)
    assert len(toolsets) == 3

    # Inspect the registered tool names. A regression that double-wired
    # one capability (e.g. two ``rag.toolset`` and dropping
    # ``contradiction.toolset``) would still satisfy ``len == 3`` but
    # the union of tool names would not include ``find_contradictions``.
    tool_names: set[str] = set()
    for ts in toolsets:
        assert isinstance(ts, FunctionToolset), f"expected FunctionToolset, got {type(ts).__name__}"
        tool_names.update(ts.tools.keys())

    assert tool_names == {"search_knowledge", "read_full_document", "find_contradictions"}, (
        f"unexpected toolset wiring; tool names = {sorted(tool_names)}"
    )
