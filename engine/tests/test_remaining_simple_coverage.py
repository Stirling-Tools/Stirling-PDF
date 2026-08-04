from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from stirling.agents import _page_text
from stirling.agents.execution import ExecutionPlanningAgent
from stirling.agents.ledger.validators import _parsing
from stirling.agents.math_presentation import MathIntentClassifier, extract_math_verdict
from stirling.agents.user_spec import UserSpecAgent, UserSpecMetadata
from stirling.api import agent_capabilities, dependencies
from stirling.api.routes.agent_capabilities import get_capabilities
from stirling.config import AppSettings
from stirling.contracts import (
    AiFile,
    ExtractedFileText,
    ExtractedTextArtifact,
    OrchestratorRequest,
    PdfTextSelection,
)
from stirling.contracts.agent_drafts import AgentDraft, AgentDraftRequest, AgentRevisionRequest
from stirling.contracts.pdf_edit import EditPlanResponse
from stirling.documents.sqlite_vec_store import SqliteVecStore, _to_sqlite_utc
from stirling.documents.store import Document, StoredPage
from stirling.models import FileId, OwnerId, PrincipalId
from stirling.services import runtime as runtime_module

# Several helpers are deliberately exercised with lightweight runtime fakes.
# pyright: reportArgumentType=false, reportAttributeAccessIssue=false


def test_page_text_helpers_cover_empty_and_populated_inputs() -> None:
    empty = [ExtractedFileText(file_name="empty.pdf", pages=[PdfTextSelection(text=" ")])]
    populated = [ExtractedFileText(file_name="a.pdf", pages=[PdfTextSelection(page_number=2, text="hello")])]
    request = OrchestratorRequest(
        user_message="read",
        files=[AiFile(id=FileId("id"), name="a.pdf")],
        artifacts=[ExtractedTextArtifact(files=populated)],
    )

    assert not _page_text.has_page_text(empty)
    assert _page_text.format_page_text(empty) == "None"
    assert _page_text.format_page_text(empty, empty="missing") == "missing"
    assert _page_text.has_page_text(populated)
    assert _page_text.format_page_text(populated) == "[File: a.pdf, Page 2]\nhello"
    assert _page_text.get_extracted_text_artifact(request) is request.artifacts[0]
    assert _page_text.get_extracted_text_artifact(OrchestratorRequest(user_message="none")) is None


def test_parsing_helpers_handle_currency_negatives_and_empty_rows() -> None:
    assert _parsing.to_decimal(" € 1,234.50 ") == 1234.50
    assert _parsing.to_decimal("(12.5)") == -12.5
    assert _parsing.to_decimal("n/a") is None
    assert _parsing.to_decimal("not a number") is None
    assert _parsing.parse_csv("a,b\n,\n1,2") == [["a", "b"], ["1", "2"]]


@pytest.mark.anyio
async def test_execution_planning_returns_explicit_not_implemented_response() -> None:
    request = SimpleNamespace(current_step_index=4)
    result = await ExecutionPlanningAgent(None).next_action(request)
    assert "step 4" in result.reason


def test_agent_capability_manifest_is_schema_derived() -> None:
    payload = agent_capabilities.manifest_payload()
    assert payload["version"] == 1
    assert len(payload["capabilities"]) == len(agent_capabilities.EXPOSED_CAPABILITIES)
    assert all(item["input_schema"] for item in payload["capabilities"])
    assert get_capabilities() == payload


def test_dependency_getters_read_app_state() -> None:
    state = SimpleNamespace(
        runtime=SimpleNamespace(documents="documents"),
        orchestrator_agent="orchestrator",
        pdf_edit_agent="edit",
        pdf_question_agent="question",
        user_spec_agent="user-spec",
        execution_planning_agent="execution",
        math_auditor_agent="math",
        pdf_comment_agent="comment",
        document_classifier_agent="classifier",
    )
    request = SimpleNamespace(app=SimpleNamespace(state=state))

    assert dependencies.get_runtime(request) is state.runtime
    assert dependencies.get_orchestrator_agent(request) == "orchestrator"
    assert dependencies.get_pdf_edit_agent(request) == "edit"
    assert dependencies.get_pdf_question_agent(request) == "question"
    assert dependencies.get_user_spec_agent(request) == "user-spec"
    assert dependencies.get_execution_planning_agent(request) == "execution"
    assert dependencies.get_document_service(request) == "documents"
    assert dependencies.get_math_auditor_agent(request) == "math"
    assert dependencies.get_pdf_comment_agent(request) == "comment"
    assert dependencies.get_document_classifier_agent(request) == "classifier"


@pytest.mark.anyio
async def test_math_intent_classifier_handles_empty_and_model_result() -> None:
    classifier = object.__new__(MathIntentClassifier)

    async def run(_message: str) -> SimpleNamespace:
        return SimpleNamespace(output=SimpleNamespace(is_math=True))

    classifier._agent = SimpleNamespace(run=run)
    assert await classifier.classify("") is False
    assert await classifier.classify("check totals") is True
    assert extract_math_verdict(OrchestratorRequest(user_message="none")) is None


@pytest.mark.anyio
async def test_user_spec_draft_revise_and_prompt_paths() -> None:
    agent = object.__new__(UserSpecAgent)
    plan = EditPlanResponse(summary="plan", rationale=None, steps=[])
    agent._build_edit_plan = AsyncMock(return_value=plan)
    agent.agent = SimpleNamespace(
        run=AsyncMock(
            return_value=SimpleNamespace(
                output=UserSpecMetadata(name="name", description="description", objective="objective")
            )
        )
    )
    draft_request = AgentDraftRequest(user_message="draft this")

    drafted = await agent.draft(draft_request)
    assert drafted.draft.name == "name"
    assert "plan" in agent._build_draft_prompt(draft_request, plan)

    revision_request = AgentRevisionRequest(
        user_message="revise this",
        current_draft=AgentDraft(name="old", description="old", objective="old", steps=[]),
    )
    revised = await agent.revise(revision_request)
    assert revised.draft.objective == "objective"
    assert "Current draft" in agent._build_revision_prompt(revision_request, plan)
    assert (await agent.orchestrate(OrchestratorRequest(user_message="orchestrate"))).draft.name == "name"

    agent._build_edit_plan = AsyncMock(return_value=SimpleNamespace(outcome="cannot_do"))
    assert await agent.draft(draft_request) == agent._build_edit_plan.return_value


def test_runtime_model_and_settings_helpers(app_settings: AppSettings) -> None:
    assert runtime_module.build_model_settings(None) == {}
    assert runtime_module.build_model_settings(42) == {"max_tokens": 42}
    runtime_module.validate_structured_output_support(
        SimpleNamespace(profile=SimpleNamespace(supports_json_schema_output=False)), "test"
    )
    with pytest.raises(ValueError, match="structured outputs"):
        runtime_module.validate_structured_output_support(
            SimpleNamespace(profile=SimpleNamespace(supports_json_schema_output=False)), "model"
        )
    assert runtime_module._build_model("test") is not None
    assert runtime_module._build_model("model", provider="openai", api_key="key") is not None
    assert runtime_module._build_model("model", provider="ollama", base_url="http://localhost") is not None
    assert runtime_module._build_model("model", provider="anthropic", api_key="key") is not None
    with pytest.raises(ValueError, match="Unsupported model provider"):
        runtime_module._build_model("model", provider="unknown")
    assert runtime_module._build_document_store(app_settings) is not None


def test_sqlite_store_pure_helpers_and_empty_read_paths() -> None:
    from datetime import UTC, datetime

    assert _to_sqlite_utc(None) is None
    assert _to_sqlite_utc(datetime(2026, 1, 1, 12, tzinfo=UTC)) == "2026-01-01 12:00:00"
    assert SqliteVecStore._sanitize_table_name("my-doc", "owner/id") == "vec_owner_id_my_doc"
    assert SqliteVecStore._normalize([0.0, 0.0]) == [0.0, 0.0]
    assert SqliteVecStore._normalize([3.0, 4.0]) == [0.6, 0.8]

    store = SqliteVecStore.ephemeral()
    try:
        assert store._sync_search("missing", [1.0], 1, []) == []
        assert store._sync_read_pages("missing", None, []) == []
        assert store._sync_has_collection("missing", []) is False
        assert store._sync_list_collections([]) == []
    finally:
        store._sync_close()


def test_settings_logging_configures_file_and_http_debug(tmp_path: Path) -> None:
    from stirling.config.settings import _configure_logging

    _configure_logging("not-a-level", str(tmp_path / "engine.log"), True)
    _configure_logging("INFO", "", False)


@pytest.mark.anyio
async def test_sqlite_store_file_and_acl_paths(tmp_path: Path) -> None:
    store = SqliteVecStore(tmp_path / "docs.db")
    owner = OwnerId("owner")
    principal = PrincipalId("user")
    try:
        await store.ensure_collection("docs", "source", owner, None)
        await store.add_documents("docs", [Document("id", "hello")], [[1.0, 0.0]], owner)
        await store.add_documents("docs", [Document("id", "updated")], [[1.0, 0.0]], owner)
        await store.add_pages("docs", [StoredPage(1, "hello", 5)], owner)
        await store.grant_read("docs", owner, [principal])
        assert (await store.search("docs", [1.0, 0.0], 1, [principal]))[0].document.text == "updated"
        assert (await store.read_pages("docs", None, [principal]))[0].text == "hello"
        assert await store.has_collection("docs", [principal])
        assert await store.list_collections([principal]) == ["docs"]
        await store.revoke("docs", owner, principal)
        assert not await store.has_collection("docs", [principal])
    finally:
        await store.close()
