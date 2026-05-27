"""Tests for EngineAuthMiddleware - shared-secret gating and health probe exemption."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from stirling.api.middleware import EngineAuthMiddleware


def _app(expected_secret: str) -> FastAPI:
    app = FastAPI()
    app.add_middleware(EngineAuthMiddleware, expected_secret=expected_secret)

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/v1/agent")
    async def agent():
        return {"ok": True}

    return app


def test_correct_secret_allows_request():
    client = TestClient(_app("s3cret"))
    res = client.get("/v1/agent", headers={"X-Engine-Auth": "s3cret"})
    assert res.status_code == 200
    assert res.json() == {"ok": True}


def test_missing_header_rejected_with_401():
    client = TestClient(_app("s3cret"))
    res = client.get("/v1/agent")
    assert res.status_code == 401


def test_wrong_header_rejected_with_401():
    client = TestClient(_app("s3cret"))
    res = client.get("/v1/agent", headers={"X-Engine-Auth": "wrong"})
    assert res.status_code == 401


def test_blank_secret_dev_mode_allows_unauthenticated():
    client = TestClient(_app(""))
    res = client.get("/v1/agent")
    assert res.status_code == 200


def test_health_endpoint_exempt_from_auth():
    client = TestClient(_app("s3cret"))
    res = client.get("/health")
    assert res.status_code == 200


def test_health_endpoint_exempt_in_dev_mode():
    client = TestClient(_app(""))
    res = client.get("/health")
    assert res.status_code == 200
