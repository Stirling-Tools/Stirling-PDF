from __future__ import annotations

from types import SimpleNamespace

import httpx
import pytest
from conftest import build_app_settings

from stirling.config import DocumentsBackend
from stirling.services import runtime as runtime_module

# Provider construction tests use minimal model/profile fakes.
# pyright: reportArgumentType=false, reportAttributeAccessIssue=false


def test_runtime_provider_and_store_branches(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    settings = build_app_settings().model_copy(
        update={
            "documents_backend": DocumentsBackend.PGVECTOR,
            "documents_pgvector_dsn": "postgresql://example",
        }
    )
    store = runtime_module._build_document_store(settings)
    assert store is not None
    assert runtime_module._build_model("model", provider="openai") is not None
    assert runtime_module._build_model("model", provider="custom", base_url="http://localhost") is not None
    assert runtime_module._build_model("anthropic:model") is not None
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert runtime_module._anthropic_provider() is not None
    assert runtime_module._build_anthropic_http_client().timeout.read == 300.0


def test_runtime_document_builder_reuses_supplied_embedder(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = build_app_settings()
    embedder = object()
    monkeypatch.setattr(runtime_module, "_build_document_store", lambda _settings: object())

    service = runtime_module._build_documents(settings, embedder=embedder)
    assert service is not None


def test_runtime_validation_accepts_supported_model() -> None:
    model = SimpleNamespace(profile=SimpleNamespace(supports_json_schema_output=True))
    runtime_module.validate_structured_output_support(model, "model")


@pytest.mark.anyio
async def test_openai_transport_normalizes_null_assistant_content(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[httpx.Request] = []

    async def base_request(_transport: httpx.AsyncHTTPTransport, request: httpx.Request) -> httpx.Request:
        seen.append(request)
        return request

    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", base_request)
    transport = runtime_module._NullContentCoercingTransport()
    request = httpx.Request(
        "POST",
        "http://localhost",
        json={"messages": [{"role": "assistant", "content": None}]},
    )
    await transport.handle_async_request(request)
    assert seen
    assert b'"content": ""' in seen[0].content
