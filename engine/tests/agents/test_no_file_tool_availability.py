"""What the answering agent is offered when no file is attached.

A product question ("how do I set up SSO?") arrives with no document. Every tool that reads
the user's documents must then be withheld AND stop describing itself, because a described-
but-uncallable tool invites the model to answer as though it had read something. Only
search_docs survives.

These guards were previously untested: deleting all three left the suite byte-identical.
"""

from __future__ import annotations

from typing import Any, cast

import pytest
from pydantic_ai import ToolDefinition

from stirling.agents.contradiction import ContradictionCapability, ContradictionDetector
from stirling.agents.shared import WholeDocReaderCapability
from stirling.contracts import AiFile
from stirling.documents import RagCapability
from stirling.models import FileId
from stirling.product_docs import DocsCapability
from stirling.services.runtime import AppRuntime


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def _tool_def(name: str) -> ToolDefinition:
    return ToolDefinition(name=name, description="", parameters_json_schema={})


def _ctx() -> Any:
    """The prepare hooks ignore their RunContext; building a real one needs a live run."""
    return cast(Any, None)


def _capabilities(runtime: AppRuntime, files: list[AiFile]) -> list[tuple[str, Any, Any]]:
    rag = RagCapability(runtime.documents, principals=[], collections=[f.id for f in files])
    whole_doc = WholeDocReaderCapability(runtime=runtime, files=files, principals=[])
    contradiction = ContradictionCapability(detector=ContradictionDetector(runtime), files=files, principals=[])
    docs = DocsCapability(runtime)
    return [
        ("search_knowledge", rag, rag._prepare_search_knowledge),
        ("read_full_document", whole_doc, whole_doc._prepare_read_full_document),
        ("find_contradictions", contradiction, contradiction._prepare_find_contradictions),
        ("search_docs", docs, docs._prepare_search_docs),
    ]


async def _offered(runtime: AppRuntime, files: list[AiFile]) -> set[str]:
    offered = set()
    for name, _cap, prepare in _capabilities(runtime, files):
        if await prepare(_ctx(), _tool_def(name)) is not None:
            offered.add(name)
    return offered


@pytest.mark.anyio
async def test_only_the_docs_tool_is_offered_when_no_file_is_attached(runtime: AppRuntime) -> None:
    assert await _offered(runtime, []) == {"search_docs"}


@pytest.mark.anyio
async def test_every_tool_is_offered_when_a_file_is_attached(runtime: AppRuntime) -> None:
    files = [AiFile(id=FileId("f1"), name="report.pdf")]
    assert await _offered(runtime, files) == {
        "search_knowledge",
        "read_full_document",
        "find_contradictions",
        "search_docs",
    }


@pytest.mark.anyio
async def test_withheld_document_tools_do_not_describe_themselves(runtime: AppRuntime) -> None:
    """The prose half of the same guard. A tool that is withheld but still offered by name in
    the instructions is a phantom: the model reads that it can read the attached documents, has
    no such tool in its schema, and the likeliest recovery is to answer from memory.

    Saying nothing is fine, and so is saying plainly that there is nothing to search - what is
    not fine is naming the tool as if it were callable."""
    for name, cap, _prepare in _capabilities(runtime, []):
        if name == "search_docs":
            continue
        instructions = cap.instructions
        assert not callable(instructions), f"{name} resolved to dynamic instructions with no files"
        assert name not in instructions, (
            f"{name} is withheld with no files but is still offered by name: {instructions!r}"
        )


@pytest.mark.anyio
async def test_document_tools_describe_themselves_when_a_file_is_attached(runtime: AppRuntime) -> None:
    files = [AiFile(id=FileId("f1"), name="report.pdf")]
    for name, cap, _prepare in _capabilities(runtime, files):
        if name == "search_docs":
            continue
        assert name in cap.instructions, f"{name} is offered but never described"
