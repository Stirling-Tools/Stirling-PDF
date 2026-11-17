"""Which engine routes Stirling Cloud's gateway may forward for a linked self-hosted server."""

from __future__ import annotations

from fastapi.routing import APIRoute, RouteContext, iter_route_contexts

from stirling.api import app
from stirling.api.dependencies import enforce_required_user_id
from stirling.api.linked_instance import LINKED_INSTANCE


def _marked_routes() -> list[RouteContext]:
    # app.routes holds each include_router call as one unexpanded entry; iter_route_contexts
    # yields the routes inside it with their prefixed path and router-level dependencies merged.
    return [
        route
        for route in iter_route_contexts(app.routes)
        if isinstance(route.original_route, APIRoute) and (route.openapi_extra or {}).items() >= LINKED_INSTANCE.items()
    ]


def test_marked_routes_reach_past_health():
    assert {route.path for route in _marked_routes()} - {"/health"}


def test_marked_routes_are_published_in_openapi():
    paths = app.openapi()["paths"]
    for route in _marked_routes():
        assert route.path is not None
        for method in route.methods or ():
            assert paths[route.path][method.lower()]["x-linked-instance"] is True


def test_config_push_is_never_forwarded():
    # It would let one linked server repoint the models every tenant shares.
    assert [route.path for route in _marked_routes() if (route.path or "").startswith("/api/v1/config")] == []


def test_every_marked_route_but_health_is_behind_the_user_gate():
    # The gateway namespaces X-User-Id per instance, which only isolates routes that read it.
    ungated = [
        route.path
        for route in _marked_routes()
        if route.path != "/health"
        and not any(dependency.dependency is enforce_required_user_id for dependency in route.dependencies)
    ]
    assert ungated == []
