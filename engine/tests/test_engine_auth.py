"""Tests for the engine shared-secret middleware (EngineSharedSecretMiddleware)."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from stirling.api.engine_auth import EngineSharedSecretMiddleware

SECRET = "s3cr3t-between-java-and-engine"

_TRUTHY = {"1", "true", "yes", "on"}


def _client(*, secret: str | None = None, require: str | None = None) -> TestClient:
    # Values come from explicit kwargs rather than env so tests don't depend on the lru-cached
    # AppSettings; this mirrors how production code wires the middleware via pydantic-settings.
    require_flag = require is not None and require.strip().lower() in _TRUTHY
    app = FastAPI()
    app.add_middleware(
        EngineSharedSecretMiddleware,
        secret=secret or "",
        require=require_flag,
    )

    @app.get("/health")
    def health() -> dict[str, bool]:
        return {"ok": True}

    @app.post("/v1/agents/invoke")
    def invoke() -> dict[str, bool]:
        return {"ran": True}

    return TestClient(app)


def test_dev_mode_open_when_unset():
    c = _client()
    assert c.post("/v1/agents/invoke").status_code == 200


def test_health_is_public_even_with_secret():
    c = _client(secret=SECRET)
    assert c.get("/health").status_code == 200  # no header required


def test_missing_header_rejected():
    c = _client(secret=SECRET)
    assert c.post("/v1/agents/invoke").status_code == 401


def test_wrong_secret_rejected():
    c = _client(secret=SECRET)
    r = c.post("/v1/agents/invoke", headers={"X-Engine-Auth": "not-the-secret"})
    assert r.status_code == 401


def test_valid_secret_allowed():
    c = _client(secret=SECRET)
    r = c.post("/v1/agents/invoke", headers={"X-Engine-Auth": SECRET})
    assert r.status_code == 200
    assert r.json() == {"ran": True}


def test_require_auth_fails_closed_without_secret():
    c = _client(require="true")
    # Require flag, no secret -> protected routes refused.
    assert c.post("/v1/agents/invoke").status_code == 503
    # Liveness still works for health checks.
    assert c.get("/health").status_code == 200


def test_require_auth_with_secret_enforces_normally():
    c = _client(secret=SECRET, require="true")
    assert c.post("/v1/agents/invoke").status_code == 401
    assert c.post("/v1/agents/invoke", headers={"X-Engine-Auth": SECRET}).status_code == 200


@pytest.mark.parametrize("flag", ["true", "1", "YES", "On"])
def test_require_flag_truthy_variants(flag: str):
    c = _client(require=flag)
    assert c.post("/v1/agents/invoke").status_code == 503


@pytest.mark.parametrize("flag", ["false", "0", "no", ""])
def test_require_flag_falsey_variants_stay_open(flag: str):
    c = _client(require=flag)
    assert c.post("/v1/agents/invoke").status_code == 200
