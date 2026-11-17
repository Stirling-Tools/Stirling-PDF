"""The MCP capability manifest only advertises routes the engine actually serves."""

from __future__ import annotations

from stirling.api import app
from stirling.api.agent_capabilities import EXPOSED_CAPABILITIES


def test_every_capability_route_is_a_served_post_route():
    # app.routes holds included routers unexpanded, so read the served paths from the schema.
    paths = app.openapi()["paths"]
    unrouted = {cap.id: cap.route for cap in EXPOSED_CAPABILITIES if "post" not in paths.get(cap.route, {})}
    assert unrouted == {}
