from __future__ import annotations

from ..base import ApiModel
from ..tool_models import OperationId


class OperationRef(ApiModel):
    """Reference to an operation with enough info for frontend tool lookup."""

    operation_id: OperationId


class IncompatibleChainError(ApiModel):
    """Validation error data for incompatible operation chains."""

    type: str  # Always "incompatible_chain"
    current_operation: OperationRef
    next_operation: OperationRef
