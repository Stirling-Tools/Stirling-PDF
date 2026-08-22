"""Serialize the MCP capabilities manifest the Java MCP server pulls at boot.

The manifest is *derived* from the agent registry: every agent declares its
exposed capabilities in ``describe()`` (see ``stirling.agents.registry``), and
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
from typing import Any, Literal

from pydantic import BaseModel

from stirling.agents import AgentDescriptor

# The manifest is a deliberately snake_case wire contract Java already consumes, so these
# use plain BaseModel rather than the camelCasing ``ApiModel``. ``input_schema`` is a JSON
# Schema, which is inherently a dynamic dict - the one accepted ``Any`` on this boundary.


class ManifestCapability(BaseModel):
    id: str
    description: str
    input_schema: dict[str, Any]
    mode: Literal["sync", "async"]
    required_scope: str
    route: str


class CapabilitiesManifest(BaseModel):
    version: int = 1
    capabilities: list[ManifestCapability]


def manifest_payload(descriptors: Iterable[AgentDescriptor]) -> CapabilitiesManifest:
    """Flatten the ``mcp`` rows of the descriptor list to the wire shape.

    Schema is derived from ``input_model.model_json_schema()`` so we never
    hand-write JSON Schema - the Pydantic model is the single source of truth.
    """
    capabilities = [
        ManifestCapability(
            id=cap.id,
            description=cap.description,
            input_schema=cap.input_model.model_json_schema(),
            mode=cap.mode,
            required_scope=cap.required_scope,
            route=cap.route,
        )
        for descriptor in descriptors
        for cap in descriptor.mcp
    ]
    return CapabilitiesManifest(capabilities=capabilities)
