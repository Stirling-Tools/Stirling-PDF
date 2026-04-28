from __future__ import annotations

from stirling.models import ApiModel, ToolEndpoint


class KnownEndpointsResponse(ApiModel):
    endpoints: list[ToolEndpoint]
