from __future__ import annotations

from typing import Any, cast
from unittest.mock import patch

import pytest
from pydantic_ai import ToolDefinition
from pydantic_ai.exceptions import UnexpectedModelBehavior

from stirling.product_docs import DocsCapability
from stirling.product_docs.capability import _LOOKUP_FAILED, _NO_MATCH, _DocSelection
from stirling.product_docs.manifest import DocPage, DocsManifest
from stirling.services.runtime import AppRuntime


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def _manifest() -> DocsManifest:
    return DocsManifest(
        pages={
            "configuration/security/sso": DocPage(
                id="configuration/security/sso",
                title="Single Sign-On",
                section="configuration/security",
                description="",
                markdown="Set SECURITY_OAUTH2_ENABLED=true to turn SSO on.",
            ),
            "functionality/compress": DocPage(
                id="functionality/compress",
                title="Compress",
                section="functionality",
                description="Shrink a PDF",
                markdown="Compression level 5 favours size over fidelity.",
            ),
        }
    )


class _StubResult:
    def __init__(self, ids: list[str]) -> None:
        self.output = _DocSelection(ids=ids)


def _tool_def() -> ToolDefinition:
    return ToolDefinition(name="search_docs", description="", parameters_json_schema={})


def _prepare_arg() -> Any:
    """The prepare hook ignores its RunContext; building a real one needs a live run."""
    return cast(Any, None)


@pytest.mark.anyio
async def test_search_docs_returns_the_selected_page_bodies(runtime: AppRuntime) -> None:
    cap = DocsCapability(runtime, manifest=_manifest())
    with patch.object(cap._selector, "run", return_value=_StubResult(["configuration/security/sso"])):
        out = await cap._search_docs("how do I set up SSO?")
    assert "SECURITY_OAUTH2_ENABLED" in out
    assert "Single Sign-On" in out


@pytest.mark.anyio
async def test_search_docs_drops_invented_ids(runtime: AppRuntime) -> None:
    """The selector only ever sees display ids, but a local model will still invent one."""
    cap = DocsCapability(runtime, manifest=_manifest())
    with patch.object(cap._selector, "run", return_value=_StubResult(["not/a/real/page", "functionality/compress"])):
        out = await cap._search_docs("what does compression level 5 do?")
    assert "favours size over fidelity" in out
    assert "not/a/real/page" not in out


@pytest.mark.anyio
async def test_search_docs_says_so_when_nothing_matches(runtime: AppRuntime) -> None:
    cap = DocsCapability(runtime, manifest=_manifest())
    with patch.object(cap._selector, "run", return_value=_StubResult([])):
        out = await cap._search_docs("what is the airspeed velocity of a swallow?")
    assert out == _NO_MATCH


@pytest.mark.anyio
async def test_search_docs_caps_the_selection_at_three_pages(runtime: AppRuntime) -> None:
    pages = {f"p{i}": DocPage(f"p{i}", f"P{i}", "s", "", f"body {i}") for i in range(6)}
    cap = DocsCapability(runtime, manifest=DocsManifest(pages=pages))
    with patch.object(cap._selector, "run", return_value=_StubResult([f"p{i}" for i in range(6)])):
        out = await cap._search_docs("everything")
    assert out.count("documentation page:") == 3


@pytest.mark.anyio
async def test_tool_is_withheld_once_the_search_budget_is_spent(runtime: AppRuntime) -> None:
    cap = DocsCapability(runtime, manifest=_manifest(), max_searches=1)
    assert await cap._prepare_search_docs(_prepare_arg(), _tool_def()) is not None
    with patch.object(cap._selector, "run", return_value=_StubResult([])):
        await cap._search_docs("q")
    assert await cap._prepare_search_docs(_prepare_arg(), _tool_def()) is None


@pytest.mark.anyio
async def test_tool_is_withheld_entirely_when_no_manifest_shipped(runtime: AppRuntime) -> None:
    """A build with no docs must not advertise a documentation search it cannot perform."""
    cap = DocsCapability(runtime, manifest=DocsManifest(pages={}))
    assert cap.available is False
    assert cap.instructions == ""
    assert await cap._prepare_search_docs(_prepare_arg(), _tool_def()) is None


@pytest.mark.anyio
async def test_selector_returning_null_ids_does_not_fail_the_question(runtime: AppRuntime) -> None:
    """Local models send explicit nulls for optional fields. A bare default_factory only
    covers an ABSENT key, so null used to fail validation and unwind the whole run."""
    assert _DocSelection.model_validate({"ids": None}).ids == []
    assert _DocSelection.model_validate({}).ids == []


@pytest.mark.anyio
async def test_a_failing_selector_degrades_instead_of_unwinding_the_run(runtime: AppRuntime) -> None:
    """An off-schema selector exhausts its retries and raises. That must not take out the
    user's whole question - it is one tool call failing, not the answer failing."""
    cap = DocsCapability(runtime, manifest=_manifest())
    failure = UnexpectedModelBehavior("Exceeded maximum output retries (1)")
    with patch.object(cap._selector, "run", side_effect=failure):
        out = await cap._search_docs("how do I set up SSO?")
    # A broken lookup must not be reported as "the manual has no such page" - that would
    # tell the user the documentation lacks a page it actually has.
    assert out == _LOOKUP_FAILED
    assert out != _NO_MATCH


def test_instructions_describe_the_tool_when_available(runtime: AppRuntime) -> None:
    cap = DocsCapability(runtime, manifest=_manifest())
    assert "search_docs" in cap.instructions
    # The catalogue itself must stay inside the tool call - it is ~2k tokens that every
    # document-only question would otherwise pay for.
    assert "configuration/security/sso" not in cap.instructions


def test_toolset_registers_exactly_the_search_docs_tool(runtime: AppRuntime) -> None:
    cap = DocsCapability(runtime, manifest=_manifest())
    assert set(cap.toolset.tools.keys()) == {"search_docs"}  # type: ignore[attr-defined]
