"""Which engine routes Stirling Cloud's gateway may forward for a linked self-hosted server."""

from __future__ import annotations

from fastapi.routing import APIRoute

from stirling.api import app
from stirling.api.dependencies import enforce_required_user_id
from stirling.api.linked_instance import LINKED_INSTANCE


def _marked_routes() -> list[APIRoute]:
    return [
        route
        for route in app.routes
        if isinstance(route, APIRoute) and (route.openapi_extra or {}).items() >= LINKED_INSTANCE.items()
    ]


def test_marked_routes_are_published_in_openapi():
    paths = app.openapi()["paths"]
    routes = _marked_routes()
    assert routes
    for route in routes:
        for method in route.methods or ():
            assert paths[route.path][method.lower()]["x-linked-instance"] is True


def test_config_push_is_never_forwarded():
    # It would let one linked server repoint the models every tenant shares.
    assert [route.path for route in _marked_routes() if route.path.startswith("/api/v1/config")] == []


def test_every_marked_route_but_health_is_behind_the_user_gate():
    # The gateway namespaces X-User-Id per instance, which only isolates routes that read it.
    ungated = [
        route.path
        for route in _marked_routes()
        if route.path != "/health"
        and not any(dependency.dependency is enforce_required_user_id for dependency in route.dependencies)
    ]
    assert ungated == []
