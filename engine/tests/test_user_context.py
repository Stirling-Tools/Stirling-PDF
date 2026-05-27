"""Tests for UserIdMiddleware - X-User-Id propagates as context.

X-Tenant-Id is deliberately NOT accepted from the wire: the Java proxy does not stamp
one and a client-supplied tenant id would be spoofable. If/when tenant scoping arrives
it must be derived from the server-side security context, not from request headers.
"""
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from stirling.api.middleware import UserIdMiddleware
from stirling.services.tracking import current_user_id


def _app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(UserIdMiddleware)

    @app.get("/me")
    async def me(request: Request):
        return {
            "user_id": current_user_id.get(),
            "tenant_id": getattr(request.state, "tenant_id", None),
        }

    return app


def test_user_id_header_is_propagated():
    client = TestClient(_app())
    res = client.get("/me", headers={"X-User-Id": "alice"})
    assert res.status_code == 200
    assert res.json()["user_id"] == "alice"


def test_tenant_id_header_is_ignored():
    client = TestClient(_app())
    res = client.get("/me", headers={"X-User-Id": "alice", "X-Tenant-Id": "acme"})
    assert res.status_code == 200
    body = res.json()
    assert body["user_id"] == "alice"
    assert body["tenant_id"] is None


def test_missing_user_id_returns_no_user_in_context():
    client = TestClient(_app())
    res = client.get("/me")
    assert res.status_code == 200
    assert res.json()["user_id"] in ("", None)
