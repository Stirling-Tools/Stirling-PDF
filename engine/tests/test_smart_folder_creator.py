from __future__ import annotations

from pytest import MonkeyPatch

from models import (
    AvailableTool,
    SmartFolderAutomation,
    SmartFolderConfig,
    SmartFolderCreateRequest,
    SmartFolderCreateResponse,
    SmartFolderOperation,
)
from smart_folder_creator import create_smart_folder_config


def _build_sample_response() -> SmartFolderCreateResponse:
    return SmartFolderCreateResponse(
        assistant_message="I will build that folder for you.",
        smart_folder_config=SmartFolderConfig(
            name="Email Prep",
            description="Compress and split for email",
            automation=SmartFolderAutomation(
                name="Email Cleanup",
                description="Email prep steps",
                operations=[SmartFolderOperation(operation="compress-pdf", parameters='{"compressionLevel": 3}')],
            ),
            icon="mail",
            accent_color="#0ea5e9",
        ),
    )


def test_create_smart_folder_config_calls_ai_and_returns_response(monkeypatch: MonkeyPatch):
    request = SmartFolderCreateRequest(
        message="Create a folder that zips attachments",
        history=[],
        available_tools=[AvailableTool(id="compress-pdf", name="Compress PDFs")],
    )
    response_value = _build_sample_response()

    with monkeypatch.context() as m:
        m.setattr("smart_folder_creator.run_ai", lambda *args, **kwargs: response_value)
        result = create_smart_folder_config(request)

    assert result == response_value
