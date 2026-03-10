from __future__ import annotations

from pytest import MonkeyPatch

from chat_router import classify_chat_route
from models import (
    ChatRouteRequest,
    ChatRouteResponse,
    CreateIntentHint,
    EditIntentHint,
    SmartFolderIntentHint,
)


def test_classify_chat_route_handles_smart_folder_intent(monkeypatch: MonkeyPatch):
    request = ChatRouteRequest(
        message="Create a workflow that batches PDFs overnight",
        history=[],
        has_files=False,
        has_create_session=False,
        has_edit_session=False,
        last_route="none",
    )
    expected_response = ChatRouteResponse(
        intent="smart_folder",
        smart_folder_intent=SmartFolderIntentHint(action="create"),
        reason="User wants to automate PDFs",
    )

    with monkeypatch.context() as m:
        m.setattr("chat_router.run_ai", lambda *args, **kwargs: expected_response)
        response = classify_chat_route(request)

    assert response.intent == "smart_folder"
    assert response.smart_folder_intent == expected_response.smart_folder_intent


def test_greeting_without_files(monkeypatch: MonkeyPatch):
    """Greetings should route to edit/info, not create"""
    request = ChatRouteRequest(
        message="Hello",
        has_files=False,
        has_create_session=False,
        has_edit_session=False,
        last_route="none",
        history=[],
    )
    expected_response = ChatRouteResponse(
        intent="edit",
        edit_intent=EditIntentHint(mode="info", requires_file_context=False),
        reason="Conversational greeting",
    )

    with monkeypatch.context() as m:
        m.setattr("chat_router.run_ai", lambda *args, **kwargs: expected_response)
        response = classify_chat_route(request)

    assert response.intent == "edit"
    assert response.edit_intent is not None
    assert response.edit_intent.mode == "info"


def test_capability_question_without_files(monkeypatch: MonkeyPatch):
    """'What can you do?' should route to edit/info"""
    request = ChatRouteRequest(
        message="What can you do?",
        has_files=False,
        has_create_session=False,
        has_edit_session=False,
        last_route="none",
        history=[],
    )
    expected_response = ChatRouteResponse(
        intent="edit",
        edit_intent=EditIntentHint(mode="info", requires_file_context=False),
        reason="User asking about capabilities",
    )

    with monkeypatch.context() as m:
        m.setattr("chat_router.run_ai", lambda *args, **kwargs: expected_response)
        response = classify_chat_route(request)

    assert response.intent == "edit"
    assert response.edit_intent is not None
    assert response.edit_intent.mode == "info"


def test_help_request(monkeypatch: MonkeyPatch):
    """Help requests should route to edit/info"""
    request = ChatRouteRequest(
        message="help",
        has_files=False,
        has_create_session=False,
        has_edit_session=False,
        last_route="none",
        history=[],
    )
    expected_response = ChatRouteResponse(
        intent="edit",
        edit_intent=EditIntentHint(mode="info", requires_file_context=False),
        reason="Help request",
    )

    with monkeypatch.context() as m:
        m.setattr("chat_router.run_ai", lambda *args, **kwargs: expected_response)
        response = classify_chat_route(request)

    assert response.intent == "edit"
    assert response.edit_intent is not None
    assert response.edit_intent.mode == "info"


def test_actual_document_creation(monkeypatch: MonkeyPatch):
    """Explicit creation requests should still route to create"""
    request = ChatRouteRequest(
        message="Create a business proposal document",
        has_files=False,
        has_create_session=False,
        has_edit_session=False,
        last_route="none",
        history=[],
    )
    expected_response = ChatRouteResponse(
        intent="create",
        create_intent=CreateIntentHint(action="start"),
        reason="User wants to create new document",
    )

    with monkeypatch.context() as m:
        m.setattr("chat_router.run_ai", lambda *args, **kwargs: expected_response)
        response = classify_chat_route(request)

    assert response.intent == "create"
    assert response.create_intent is not None
    assert response.create_intent.action == "start"


def test_edit_command_with_files(monkeypatch: MonkeyPatch):
    """Edit commands should still route to edit/command"""
    request = ChatRouteRequest(
        message="Compress this PDF",
        has_files=True,
        has_create_session=False,
        has_edit_session=False,
        last_route="none",
        history=[],
    )
    expected_response = ChatRouteResponse(
        intent="edit",
        edit_intent=EditIntentHint(mode="command", requires_file_context=False),
        reason="User wants to compress PDF",
    )

    with monkeypatch.context() as m:
        m.setattr("chat_router.run_ai", lambda *args, **kwargs: expected_response)
        response = classify_chat_route(request)

    assert response.intent == "edit"
    assert response.edit_intent is not None
    assert response.edit_intent.mode == "command"
