"""Tests for the config-push endpoint (POST /api/v1/config), driving the real lifespan so app.state is populated."""

from __future__ import annotations

import asyncio
import threading
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

import pytest
from conftest import build_app_settings
from fastapi.testclient import TestClient

from stirling.api import app
from stirling.api.app import _adopt_cached_config_if_changed
from stirling.config import AppSettings, config_cache, load_settings
from stirling.contracts import ConfigPushRequest
from stirling.documents import DocumentService


@pytest.fixture(autouse=True)
def _isolate_config_cache(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Point the encrypted config cache at a per-test tmp dir so persistence never leaks."""
    monkeypatch.setattr(config_cache, "_default_data_dir", lambda: tmp_path)


@contextmanager
def _client(
    settings_factory: Callable[[], AppSettings],
    *,
    client_addr: tuple[str, int] = ("127.0.0.1", 12345),
) -> Iterator[TestClient]:
    """Enter a TestClient whose lifespan builds app.state from ``settings_factory``."""
    previous = app.dependency_overrides.get(load_settings)
    app.dependency_overrides[load_settings] = settings_factory
    try:
        with TestClient(app, client=client_addr) as client:
            yield client
    finally:
        if previous is None:
            app.dependency_overrides.pop(load_settings, None)
        else:
            app.dependency_overrides[load_settings] = previous


def _anthropic_push() -> dict[str, object]:
    return {
        "models": {
            "provider": "anthropic",
            "smartModel": "claude-haiku-4-5",
            "fastModel": "claude-haiku-4-5",
            "smartMaxTokens": 4096,
            "fastMaxTokens": 1024,
            "apiKey": "test-key-not-a-real-secret",
            "baseUrl": "",
        },
        "rag": {
            "embeddingProvider": "",
            "embeddingModel": "",
            "embeddingApiKey": "",
            "embeddingBaseUrl": "",
            "topK": 7,
            "maxSearches": 3,
        },
        "limits": {"maxPages": 50, "maxCharacters": 12345, "modelMaxConcurrency": 8},
    }


def test_config_push_forbidden_when_disabled() -> None:
    def factory() -> AppSettings:
        return build_app_settings().model_copy(update={"allow_config_push": False})

    with _client(factory) as client:
        response = client.post("/api/v1/config", json=_anthropic_push())
    assert response.status_code == 403


def test_config_push_from_non_local_caller_without_secret_returns_403() -> None:
    """Secure-by-default: with no shared secret, a remote caller cannot push a config."""
    with _client(build_app_settings, client_addr=("203.0.113.9", 4444)) as client:
        response = client.post("/api/v1/config", json=_anthropic_push())
    assert response.status_code == 403
    assert "STIRLING_ENGINE_SHARED_SECRET" in response.json()["detail"]


def test_config_push_from_loopback_with_forwarded_header_returns_403() -> None:
    """A forwarding header means the peer address may be proxy-rewritten, so loopback isn't trusted without a secret."""
    with _client(build_app_settings) as client:  # peer is loopback 127.0.0.1
        response = client.post(
            "/api/v1/config",
            json=_anthropic_push(),
            headers={"X-Forwarded-For": "127.0.0.1"},
        )
    assert response.status_code == 403
    assert "STIRLING_ENGINE_SHARED_SECRET" in response.json()["detail"]


def test_config_push_persist_failure_still_applies_without_500() -> None:
    """Persistence is best-effort: a persist failure must not turn an already-applied push into a 500."""
    with _client(build_app_settings) as client:
        with patch(
            "stirling.api.routes.config.save_config",
            side_effect=ValueError("corrupt keyfile"),
        ):
            response = client.post("/api/v1/config", json=_anthropic_push())
        assert response.status_code == 200
        # The config WAS applied live despite the persist failure.
        assert app.state.settings.smart_model_name == "claude-haiku-4-5"
        assert any("could not be persisted" in note for note in response.json()["notes"])


def test_config_push_applies_model_and_limits() -> None:
    with _client(build_app_settings) as client:
        response = client.post("/api/v1/config", json=_anthropic_push())
        assert response.status_code == 200
        body = response.json()
        # Wire summary is camelCase and never echoes the api key.
        assert body["smartModel"] == "claude-haiku-4-5"
        assert body["fastModel"] == "claude-haiku-4-5"
        assert body["smartMaxTokens"] == 4096
        assert body["ragTopK"] == 7
        assert body["maxPages"] == 50
        assert body["modelMaxConcurrency"] == 8
        assert "test-key-not-a-real-secret" not in response.text
        # State was swapped: the running settings now reflect the push.
        assert app.state.settings.smart_model_name == "claude-haiku-4-5"
        assert app.state.settings.max_pages == 50
        assert app.state.runtime.documents.default_top_k == 7


def test_config_push_unsupported_provider_returns_400_without_swap() -> None:
    with _client(build_app_settings) as client:
        before = app.state.runtime
        payload = _anthropic_push()
        payload["models"]["provider"] = "nonsense-provider"  # type: ignore[index]
        response = client.post("/api/v1/config", json=payload)
        assert response.status_code == 400
        # Running runtime is untouched when the push is rejected.
        assert app.state.runtime is before
        assert app.state.settings.smart_model_name == "test"


def test_config_push_unsupported_model_returns_400() -> None:
    """A model that fails structured-output validation is rejected with 400."""
    with _client(build_app_settings) as client:
        before = app.state.runtime
        with patch(
            "stirling.api.routes.config.validate_structured_output_support",
            side_effect=ValueError("Unsupported model foo. This model does not support structured outputs."),
        ):
            response = client.post("/api/v1/config", json=_anthropic_push())
        assert response.status_code == 400
        assert "does not support structured outputs" in response.json()["detail"]
        assert app.state.runtime is before


def test_config_push_ollama_embedding_rebuilds_embedder() -> None:
    """A pushed ollama/custom embedding provider swaps the embedder onto the reused store, with a re-index note."""
    with _client(build_app_settings) as client:
        store_before = app.state.runtime.documents
        embedder_before = app.state.runtime.documents.embedder
        payload = _anthropic_push()
        payload["rag"] = {
            "embeddingProvider": "ollama",
            "embeddingModel": "nomic-embed-text",
            "embeddingApiKey": "",
            "embeddingBaseUrl": "http://localhost:11434/v1",
            "topK": 9,
            "maxSearches": 4,
        }
        response = client.post("/api/v1/config", json=payload)
        assert response.status_code == 200
        body = response.json()
        assert body["ragEmbeddingModel"] == "ollama:nomic-embed-text"
        assert any("re-index" in note for note in body["notes"])
        docs = app.state.runtime.documents
        # Same store object reused (connection pool intact), embedder swapped.
        assert docs is store_before
        assert docs.embedder is not embedder_before
        assert docs.default_top_k == 9


def test_config_push_unsupported_embedding_provider_returns_400() -> None:
    with _client(build_app_settings) as client:
        embedder_before = app.state.runtime.documents.embedder
        payload = _anthropic_push()
        payload["rag"] = {
            "embeddingProvider": "totally-bogus",
            "embeddingModel": "x",
            "embeddingApiKey": "",
            "embeddingBaseUrl": "",
            "topK": None,
            "maxSearches": None,
        }
        response = client.post("/api/v1/config", json=payload)
        assert response.status_code == 400
        # Embedder untouched when the push is rejected.
        assert app.state.runtime.documents.embedder is embedder_before


def test_config_push_empty_models_keep_env_value() -> None:
    """An empty models block keeps the engine's env models but still applies pushed limits."""
    with _client(build_app_settings) as client:
        payload = _anthropic_push()
        payload["models"] = {
            "provider": "",
            "smartModel": "",
            "fastModel": "",
            "smartMaxTokens": None,
            "fastMaxTokens": None,
            "apiKey": "",
            "baseUrl": "",
        }
        response = client.post("/api/v1/config", json=payload)
        assert response.status_code == 200
        # Env "test" model preserved for both tiers; limits still applied.
        assert app.state.settings.smart_model_name == "test"
        assert app.state.settings.fast_model_name == "test"
        assert app.state.settings.max_pages == 50


def test_config_push_ignores_unknown_fields() -> None:
    """A newer processor pushing unknown fields must not 422; they are ignored and the rest applies."""
    with _client(build_app_settings) as client:
        payload = _anthropic_push()
        payload["futureTopLevelField"] = {"anything": 1}
        payload["models"]["experimentalFlag"] = True  # type: ignore[index]
        response = client.post("/api/v1/config", json=payload)
        assert response.status_code == 200
        assert app.state.settings.smart_model_name == "claude-haiku-4-5"
        assert app.state.settings.max_pages == 50


def test_boot_restores_cached_config() -> None:
    """A persisted config is decrypted and applied on boot, overriding env."""
    config_cache.save_config(ConfigPushRequest.model_validate(_anthropic_push()))
    with _client(build_app_settings):
        # Env model is "test"; the cache pushed claude-haiku-4-5 + limits.
        assert app.state.settings.smart_model_name == "claude-haiku-4-5"
        assert app.state.settings.fast_model_name == "claude-haiku-4-5"
        assert app.state.settings.max_pages == 50
        assert app.state.settings.smart_model_max_tokens == 4096
        assert app.state.runtime.documents.default_top_k == 7


def test_boot_ignores_cache_when_push_disabled() -> None:
    """With allow_config_push false, env wins and the cache is ignored."""
    config_cache.save_config(ConfigPushRequest.model_validate(_anthropic_push()))

    def factory() -> AppSettings:
        return build_app_settings().model_copy(update={"allow_config_push": False})

    with _client(factory):
        assert app.state.settings.smart_model_name == "test"
        assert app.state.settings.max_pages == 200


def test_boot_proceeds_on_corrupt_cache(tmp_path: Path) -> None:
    """A corrupt cache file is ignored and boot falls back to env, never crashing."""
    (tmp_path / "ai_config_cache.enc").write_bytes(b"not-a-valid-fernet-token")
    with _client(build_app_settings):
        assert app.state.settings.smart_model_name == "test"
        assert app.state.settings.max_pages == 200


def test_config_push_from_remote_caller_is_allowed_when_secret_is_set() -> None:
    """The loopback gate is a fallback for the no-secret case only; a remote caller may push once a secret is set."""

    def factory() -> AppSettings:
        return build_app_settings().model_copy(update={"engine_shared_secret": "s3cret"})

    with _client(factory, client_addr=("203.0.113.9", 4444)) as client:
        response = client.post("/api/v1/config", json=_anthropic_push())
    assert response.status_code == 200
    assert app.state.settings.smart_model_name == "claude-haiku-4-5"


@pytest.mark.parametrize(
    ("section", "field", "value"),
    [
        ("limits", "modelMaxConcurrency", 0),
        ("limits", "modelMaxConcurrency", -1),
        ("limits", "maxPages", 0),
        ("limits", "maxCharacters", 0),
        ("rag", "topK", 0),
        ("models", "smartMaxTokens", 0),
    ],
)
def test_config_push_rejects_out_of_range_numbers(section: str, field: str, value: int) -> None:
    """Out-of-range numbers are rejected by the contract before anything is applied."""
    with _client(build_app_settings) as client:
        payload = _anthropic_push()
        payload[section][field] = value  # type: ignore[index]
        response = client.post("/api/v1/config", json=payload)
        assert response.status_code == 422
        # Nothing was applied: the engine is still on its env config.
        assert app.state.settings.smart_model_name == "test"
        assert app.state.settings.max_pages == 200


def test_config_push_allows_zero_max_searches() -> None:
    """0 searches is a legitimate "no retrieval" setting, not an out-of-range value."""
    with _client(build_app_settings) as client:
        payload = _anthropic_push()
        payload["rag"]["maxSearches"] = 0  # type: ignore[index]
        response = client.post("/api/v1/config", json=payload)
        assert response.status_code == 200
        assert app.state.settings.rag_max_searches == 0


def test_second_push_keeps_a_colon_bearing_model_name() -> None:
    """A pushed model name may contain a colon ("llama3.1:8b") and must survive a follow-up push, not be re-stripped."""
    ollama_push: dict[str, object] = {
        "models": {
            "provider": "ollama",
            "smartModel": "llama3.1:8b",
            "fastModel": "llama3.1:8b",
            "baseUrl": "http://localhost:11434/v1",
        },
        "rag": {},
        "limits": {},
    }
    with _client(build_app_settings) as client:
        assert client.post("/api/v1/config", json=ollama_push).status_code == 200
        assert app.state.settings.smart_model_name == "llama3.1:8b"

        # Second push: same provider/base URL, model left empty ("keep what you have").
        followup: dict[str, object] = {
            "models": {
                "provider": "ollama",
                "smartModel": "",
                "fastModel": "",
                "baseUrl": "http://localhost:11434/v1",
            },
            "rag": {},
            "limits": {"maxPages": 42},
        }
        response = client.post("/api/v1/config", json=followup)
        assert response.status_code == 200
        assert app.state.settings.smart_model_name == "llama3.1:8b"
        assert app.state.settings.fast_model_name == "llama3.1:8b"
        assert app.state.settings.max_pages == 42


def test_worker_adopts_a_config_pushed_to_a_sibling_worker() -> None:
    """A push reaches one uvicorn worker; the rest adopt it from the shared cache file."""
    with _client(build_app_settings):
        assert app.state.settings.smart_model_name == "test"

        config_cache.save_config(ConfigPushRequest.model_validate(_anthropic_push()))
        _adopt_cached_config_if_changed(app)

        assert app.state.settings.smart_model_name == "claude-haiku-4-5"
        assert app.state.settings.max_pages == 50
        assert app.state.runtime.documents.default_top_k == 7


def test_worker_does_not_rebuild_when_the_cache_is_unchanged() -> None:
    """The watcher is a poll, so an unchanged cache must be a no-op, not a rebuild every tick."""
    config_cache.save_config(ConfigPushRequest.model_validate(_anthropic_push()))
    with _client(build_app_settings):
        before = app.state.orchestrator_agent
        _adopt_cached_config_if_changed(app)
        assert app.state.orchestrator_agent is before


def test_shutdown_drains_background_tasks_instead_of_cancelling_them() -> None:
    """Shutdown must let the reaper iteration finish before the store closes, else close segfaults sqlite-vec."""
    reap_finished = threading.Event()

    async def slow_reap(*_args: object, **_kwargs: object) -> int:
        # Long enough to still be running when the (empty) test body hands back to teardown.
        await asyncio.sleep(0.2)
        reap_finished.set()
        return 0

    with patch.object(DocumentService, "reap_expired", slow_reap):
        with _client(build_app_settings):
            pass

    assert reap_finished.is_set(), "teardown cancelled the reaper mid-iteration"
