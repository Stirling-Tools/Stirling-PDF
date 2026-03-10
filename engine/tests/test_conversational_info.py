from __future__ import annotations

import os
import pathlib
import sys

from pytest import MonkeyPatch

BACKEND_DIR = pathlib.Path(__file__).resolve().parents[1]
sys.path.append(str(BACKEND_DIR))

os.environ.setdefault("OPENAI_API_KEY", "test")
os.environ.setdefault("POSTHOG_API_KEY", "test")

from editing.decisions import answer_conversational_info  # noqa: E402
from file_processing_agent import ToolCatalogService  # noqa: E402


def test_answer_conversational_info_greeting(monkeypatch: MonkeyPatch):
    """Test handling of greeting without files"""

    class MockResponse:
        message = "Hello! I can help you with PDF operations like compress, merge, split, and more."

    def mock_run_ai(*args, **kwargs):
        return MockResponse()

    with monkeypatch.context() as m:
        m.setattr("editing.decisions.run_ai", mock_run_ai)

        tool_catalog = ToolCatalogService()
        result = answer_conversational_info(
            message="Hello",
            history=[],
            tool_catalog=tool_catalog,
        )

        assert isinstance(result, str)
        assert len(result) > 0


def test_answer_conversational_info_capabilities(monkeypatch: MonkeyPatch):
    """Test handling of capability questions"""

    class MockResponse:
        message = "I can help with compress, merge, split, rotate, watermark, OCR, and many other PDF operations."

    def mock_run_ai(*args, **kwargs):
        return MockResponse()

    with monkeypatch.context() as m:
        m.setattr("editing.decisions.run_ai", mock_run_ai)

        tool_catalog = ToolCatalogService()
        result = answer_conversational_info(
            message="What can you do?",
            history=[],
            tool_catalog=tool_catalog,
        )

        assert isinstance(result, str)
        assert len(result) > 0
