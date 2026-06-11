"""Serialize the MCP capabilities manifest the Java MCP server pulls at boot.

The manifest is *derived* from the agent registry: every agent declares its
exposed capabilities in ``describe()`` (see ``stirling.agents._registry``), and
this module flattens the ``mcp`` rows of the startup descriptor list into the
wire shape Java consumes. There is no separately maintained capability list to
keep in sync — adding an MCP capability means adding an ``McpCapability`` to the
owning agent's descriptor.

Curation note: exposure is opt-in. An agent is published to MCP only if its
descriptor carries one or more ``McpCapability`` rows; registering an agent with
the orchestrator does not auto-expose it over the (OAuth-scoped) MCP surface.

The Java side pulls ``/api/v1/agents/capabilities`` once at boot and again every
few minutes; the manifest is the authoritative source for the ``stirling_ai`` MCP
tool's operation enum.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from stirling.agents import AgentDescriptor


def manifest_payload(descriptors: Iterable[AgentDescriptor]) -> dict[str, Any]:
    """Flatten the ``mcp`` rows of the descriptor list to the wire shape.

    Schema is derived from ``input_model.model_json_schema()`` so we never
    hand-write JSON Schema - the Pydantic model is the single source of truth.
    """
    items: list[dict[str, Any]] = []
    for descriptor in descriptors:
        for cap in descriptor.mcp:
            items.append(
                {
                    "id": cap.id,
                    "description": cap.description,
                    "input_schema": cap.input_model.model_json_schema(),
                    "mode": cap.mode,
                    "required_scope": cap.required_scope,
                    "route": cap.route,
                }
            )
    return {"version": 1, "capabilities": items}
