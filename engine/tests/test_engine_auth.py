"""Tests for the engine shared-secret middleware (EngineSharedSecretMiddleware)."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from stirling.api.engine_auth import EngineSharedSecretMiddleware

SECRET = "s3cr3t-between-java-and-engine"
ENV_SECRET = "STIRLING_ENGINE_SHARED_SECRET"
ENV_REQUIRE = "STIRLING_ENGINE_REQUIRE_AUTH"


def _client(monkeypatch, *, secret: str | None = None, require: str | None = None) -> TestClient:
    monkeypatch.delenv(ENV_SECRET, raising=False)
    monkeypatch.delenv(ENV_REQUIRE, raising=False)
    if secret is not None:
        monkeypatch.setenv(ENV_SECRET, secret)
    if require is not None:
        monkeypatch.setenv(ENV_REQUIRE, require)

    app = FastAPI()
    # Middleware reads env in __init__ (when the stack builds), after the monkeypatch above.
    app.add_middleware(EngineSharedSecretMiddleware)

    @app.get("/health")
    def health() -> dict:
        return {"ok": True}

    @app.post("/v1/agents/invoke")
    def invoke() -> dict:
        return {"ran": True}

    return TestClient(app)


def test_dev_mode_open_when_unset(monkeypatch):
    c = _client(monkeypatch)
    assert c.post("/v1/agents/invoke").status_code == 200


def test_health_is_public_even_with_secret(monkeypatch):
    c = _client(monkeypatch, secret=SECRET)
    assert c.get("/health").status_code == 200  # no header required


def test_missing_header_rejected(monkeypatch):
    c = _client(monkeypatch, secret=SECRET)
    assert c.post("/v1/agents/invoke").status_code == 401


def test_wrong_secret_rejected(monkeypatch):
    c = _client(monkeypatch, secret=SECRET)
    r = c.post("/v1/agents/invoke", headers={"X-Engine-Auth": "not-the-secret"})
    assert r.status_code == 401


def test_valid_secret_allowed(monkeypatch):
    c = _client(monkeypatch, secret=SECRET)
    r = c.post("/v1/agents/invoke", headers={"X-Engine-Auth": SECRET})
    assert r.status_code == 200
    assert r.json() == {"ran": True}


def test_require_auth_fails_closed_without_secret(monkeypatch):
    c = _client(monkeypatch, require="true")
    # Require flag, no secret -> protected routes refused.
    assert c.post("/v1/agents/invoke").status_code == 503
    # Liveness still works for health checks.
    assert c.get("/health").status_code == 200


def test_require_auth_with_secret_enforces_normally(monkeypatch):
    c = _client(monkeypatch, secret=SECRET, require="true")
    assert c.post("/v1/agents/invoke").status_code == 401
    assert (
        c.post("/v1/agents/invoke", headers={"X-Engine-Auth": SECRET}).status_code == 200
    )


@pytest.mark.parametrize("flag", ["true", "1", "YES", "On"])
def test_require_flag_truthy_variants(monkeypatch, flag):
    c = _client(monkeypatch, require=flag)
    assert c.post("/v1/agents/invoke").status_code == 503


@pytest.mark.parametrize("flag", ["false", "0", "no", ""])
def test_require_flag_falsey_variants_stay_open(monkeypatch, flag):
    c = _client(monkeypatch, require=flag)
    assert c.post("/v1/agents/invoke").status_code == 200
