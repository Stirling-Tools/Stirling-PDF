"""OpenAPI marker for the routes a linked self-hosted server may call through Stirling Cloud."""

from __future__ import annotations

from typing import Any

# Stirling Cloud's gateway reads this from /openapi.json and refuses every unmarked route.
LINKED_INSTANCE: dict[str, Any] = {"x-linked-instance": True}
