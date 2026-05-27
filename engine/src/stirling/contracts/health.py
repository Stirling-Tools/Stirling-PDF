from __future__ import annotations

from stirling.models import ApiModel


class HealthResponse(ApiModel):
    status: str
