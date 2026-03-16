from __future__ import annotations

import json
import logging
import time
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from typing import Any

import models
from config import FAST_MODEL, SMART_MODEL
from editing.params import dump_params
from llm_utils import run_ai
from models import tool_models
from prompts import (
    ToolParamEntry,
    ToolParamIndex,
    edit_followup_intent_prompt,
    edit_missing_parameter_fill_prompt,
    edit_tool_clarification_prompt,
    edit_tool_parameter_fill_prompt,
    edit_tool_selection_system_prompt,
)

logger = logging.getLogger(__name__)

FILE_PARAM_NAMES = {"fileInput", "fileId", "file"}
CLARIFICATION_RULES = {
    "removePassword": {
        "ask_for": ["password"],
        "note": "If the user says there is no password or it is empty, set password to an empty string.",
    }
}


@dataclass(frozen=True)
class ToolCatalog:
    operation_ids: list[tool_models.OperationId]


@dataclass(frozen=True)
class ToolSelectionEntry:
    operation_id: tool_models.OperationId


@dataclass(frozen=True)
class ToolOperationDetail:
    operation_id: tool_models.OperationId
    clarification: dict[str, Any] | None


class ToolCatalogService:
    def __init__(self, *, endpoint_cache_ttl_seconds: float = 60.0) -> None:
        self._endpoint_cache_ttl_seconds = endpoint_cache_ttl_seconds
        self._catalog_cache = ToolCatalog(operation_ids=[])
        self._catalog_cache_ts: float = time.time()
        self._catalog_cache_initialized = False

    def _build_catalog(self) -> ToolCatalog:
        all_ops = sorted(tool_models.OPERATIONS.keys())
        enabled_ops = list(all_ops)
        excluded_no_file = 0
        excluded_non_binary = 0
        excluded_disabled = 0
        logger.info(
            "[EDIT] Catalog presort total_ops=%s file_ops=%s excluded_no_file=%s excluded_non_binary=%s excluded_disabled=%s",
            len(all_ops),
            len(enabled_ops),
            excluded_no_file,
            excluded_non_binary,
            excluded_disabled,
        )
        logger.info(
            "[EDIT] Enabled operations: %s",
            "\n".join(str(op_id) for op_id in enabled_ops),
        )
        return ToolCatalog(
            operation_ids=enabled_ops,
        )

    def get_catalog(self) -> ToolCatalog:
        if not self._catalog_cache_initialized:
            self._catalog_cache = self._build_catalog()
            self._catalog_cache_ts = time.time()
            self._catalog_cache_initialized = True
            logger.info("[EDIT] Loaded %s file-processing operations", len(self._catalog_cache.operation_ids))
        elif time.time() - self._catalog_cache_ts >= self._endpoint_cache_ttl_seconds:
            self._catalog_cache = self._build_catalog()
            self._catalog_cache_ts = time.time()
            logger.info("[EDIT] Refreshed file-processing operations=%s", len(self._catalog_cache.operation_ids))
        return self._catalog_cache

    def build_selection_index(self) -> list[ToolSelectionEntry]:
        catalog = self.get_catalog()
        payload: list[ToolSelectionEntry] = []
        for operation_id in catalog.operation_ids:
            payload.append(
                ToolSelectionEntry(
                    operation_id=operation_id,
                )
            )
        return payload

    def build_catalog_prompt(self) -> str:
        catalog = self.get_catalog()
        payload = [self._build_operation_detail(operation_id) for operation_id in catalog.operation_ids]
        return json.dumps([asdict(item) for item in payload], ensure_ascii=True)

    def _build_operation_detail(
        self,
        operation_id: tool_models.OperationId,
    ) -> ToolOperationDetail:
        return ToolOperationDetail(
            operation_id=operation_id,
            clarification=CLARIFICATION_RULES.get(operation_id),
        )

    def _build_operation_parameter_index(
        self,
        param_model: tool_models.ParamToolModelType | None,
    ) -> ToolParamIndex:
        if param_model is None:
            return ToolParamIndex(params=[])
        params: list[ToolParamEntry] = []
        for py_name in sorted(param_model.model_fields.keys()):
            field = param_model.model_fields[py_name]
            params.append(
                ToolParamEntry(
                    name=field.alias or py_name,
                    python_name=py_name,
                    required=field.is_required(),
                    type=str(field.annotation),
                    description=field.description,
                )
            )
        return ToolParamIndex(params=params)

    def select_edit_tool(
        self,
        history: list[models.ChatMessage],
        uploaded_files: list[models.UploadedFileInfo],
        preflight: models.PdfPreflight | None = None,
        session_id: str | None = None,
    ) -> models.EditToolSelection:
        selection_index = self.build_selection_index()
        system_instructions = edit_tool_selection_system_prompt(
            uploaded_files=uploaded_files,
            preflight=preflight,
            tool_catalog=[entry.operation_id for entry in selection_index],
        )
        messages = [
            models.ChatMessage(role="system", content=system_instructions),
            *history,
        ]
        response = run_ai(
            SMART_MODEL,
            messages,
            models.EditToolSelection,
            tag="edit_tool_selection",
            log_label="edit-tool-selection",
            session_id=session_id,
        )
        return response

    def should_ask_clarification(
        self,
        operation_id: tool_models.OperationId,
        user_message: str,
        history: list[models.ChatMessage],
        parameters: dict[str, Any],
        session_id: str | None = None,
    ) -> models.ClarificationDecision:
        op_detail = self._build_operation_detail(operation_id)
        system_instructions = edit_tool_clarification_prompt()
        system_payload = {
            "instructions": system_instructions,
            "operation": asdict(op_detail),
            "current_parameters": parameters,
        }
        messages = [
            models.ChatMessage(role="system", content=[system_payload]),
            *history,
        ]
        response = run_ai(
            FAST_MODEL,
            messages,
            models.ClarificationDecision,
            tag="edit_tool_clarification",
            log_label="edit-tool-clarification",
            session_id=session_id,
        )
        return response

    def extract_operation_parameters(
        self,
        operation_id: tool_models.OperationId,
        previous_operations: Sequence[tuple[tool_models.OperationId, tool_models.ParamToolModel | None]],
        user_message: str,
        history: list[models.ChatMessage],
        preflight: models.PdfPreflight | None = None,
        session_id: str | None = None,
    ) -> tool_models.ParamToolModel | None:
        ai_request_model = tool_models.OPERATIONS.get(operation_id)
        if ai_request_model is None:
            return None
        if not issubclass(ai_request_model, models.ApiModel):
            raise TypeError(f"AI request model must be models.ApiModel, got: {ai_request_model}")
        param_index = self._build_operation_parameter_index(ai_request_model)
        system_instructions = edit_tool_parameter_fill_prompt(
            operation_id=operation_id,
            preflight=preflight,
            parameter_catalog=param_index,
            previous_operations=previous_operations,
        )
        messages = [
            models.ChatMessage(role="system", content=system_instructions),
            *history,
        ]
        result = run_ai(
            SMART_MODEL,
            messages,
            ai_request_model,
            tag="edit_tool_params",
            log_label="edit-tool-params",
            session_id=session_id,
        )
        return result

    def fill_missing_parameters(
        self,
        operation_id: tool_models.OperationId,
        user_message: str,
        history: list[models.ChatMessage],
        missing_parameters: list[str],
        current_parameters: tool_models.ParamToolModel | None,
        preflight: models.PdfPreflight | None = None,
        session_id: str | None = None,
    ) -> tool_models.ParamToolModel | None:
        ai_request_model = tool_models.OPERATIONS.get(operation_id)
        if ai_request_model is None:
            return None
        if not issubclass(ai_request_model, models.ApiModel):
            raise TypeError(f"AI request model must be models.ApiModel, got: {ai_request_model}")
        current_params_dump = dump_params(current_parameters)
        system_instructions = edit_missing_parameter_fill_prompt()
        system_payload = {
            "instructions": system_instructions,
            "operation_id": operation_id,
            "missing_parameters": missing_parameters,
            "current_parameters": current_params_dump,
            "preflight": preflight.model_dump(by_alias=True, exclude_none=True) if preflight else None,
        }
        messages = [
            models.ChatMessage(role="system", content=[system_payload]),
            *history,
        ]
        allowed = set(missing_parameters)
        result = run_ai(
            FAST_MODEL,
            messages,
            ai_request_model,
            tag="edit_missing_fill",
            log_label="edit-missing-fill",
            session_id=session_id,
        )
        params = result.model_dump(by_alias=True, exclude_none=True)
        filtered = {name: value for name, value in params.items() if name in allowed}
        return ai_request_model.model_validate(filtered)

    def decide_followup_intent(
        self,
        user_message: str,
        history: list[models.ChatMessage],
        pending_requirements: list[models.PendingRequirement],
        session_id: str | None = None,
    ) -> models.FollowupIntent:
        pending_dump = [
            {
                "operation_id": requirement.operation_id,
                "parameters": dump_params(requirement.parameters),
                "missing": requirement.missing,
            }
            for requirement in pending_requirements
        ]
        system_instructions = edit_followup_intent_prompt()
        system_payload = {
            "instructions": system_instructions,
            "pending_requirements": pending_dump,
        }
        messages = [
            models.ChatMessage(role="system", content=[system_payload]),
            *history,
            models.ChatMessage(role="user", content=user_message),
        ]
        response = run_ai(
            FAST_MODEL,
            messages,
            models.FollowupIntent,
            tag="edit_followup_intent",
            log_label="edit-followup-intent",
            log_exchange=True,
            session_id=session_id,
        )
        return response

    def get_operation(self, operation_id: tool_models.OperationId) -> tool_models.ParamToolModelType | None:
        return tool_models.OPERATIONS.get(operation_id)
