from __future__ import annotations

from stirling.models.base import ApiModel


class HealthResponse(ApiModel):
    status: str
    smart_model: str
    fast_model: str
