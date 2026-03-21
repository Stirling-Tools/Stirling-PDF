import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

from models import ChatMessage, PdfPreflight, tool_models


@dataclass
class EditSessionFile:
    file_id: str
    file_path: str
    file_name: str
    file_type: str | None
    preflight: PdfPreflight = field(default_factory=PdfPreflight)


@dataclass
class PendingOperation:
    """Single operation in a pending plan."""

    operation_id: tool_models.OperationId
    parameters: tool_models.ParamToolModel


@dataclass
class PendingPlan:
    """
    Unified pending plan for both awaiting params and awaiting confirmation.
    This replaces the old separate pending_operations/pending_operation_id/pending_requirements.
    """

    plan_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    state: Literal["AWAITING_CONFIRM"] = "AWAITING_CONFIRM"
    ops: list[PendingOperation] = field(default_factory=list)
    risk_level: str = "low"
    risk_reasons: list[str] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    source_message: str | None = None


@dataclass
class EditSession:
    session_id: str
    file_path: str
    file_name: str
    file_type: str | None
    messages: list[ChatMessage] = field(default_factory=list)

    # Unified pending plan
    pending_plan: PendingPlan | None = None

    # Last executed operation (for repeat requests)
    last_operation_id: tool_models.OperationId | None = None
    last_parameters: tool_models.ParamToolModel | None = None

    # File metadata
    preflight: PdfPreflight = field(default_factory=PdfPreflight)
    files: list[EditSessionFile] = field(default_factory=list)
    attachments: dict[str, EditSessionFile] = field(default_factory=dict)

    # Document context (for Q&A)
    file_context: dict[str, Any] | None = None
    file_context_path: str | None = None

    # Idempotency tracking
    executed_plan_ids: set[str] = field(default_factory=set)


class EditSessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, EditSession] = {}

    def get(self, session_id: str) -> EditSession | None:
        return self._sessions.get(session_id)

    def set(self, session: EditSession) -> None:
        self._sessions[session.session_id] = session

    def delete(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)
