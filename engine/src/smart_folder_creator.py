from __future__ import annotations

from typing import Any

from config import SMART_MODEL
from llm_utils import run_ai
from models import AvailableTool, ChatMessage, SmartFolderCreateRequest, SmartFolderCreateResponse, SmartFolderOperation
from prompts import smart_folder_system_prompt


def validate_and_fix_operations(
    operations: list[dict[str, Any]], available_tools: list[AvailableTool]
) -> tuple[list[dict[str, Any]], list[str]]:
    """
    Validate operations against available tools and attempt fuzzy matching.

    Returns:
        tuple: (fixed_operations, warnings)
    """
    # Create lookup sets
    tool_ids = {tool.id for tool in available_tools}

    # Fuzzy matching dictionary (common synonyms)
    fuzzy_matches = {
        "optimize": "compress-pdf",
        "compression": "compress-pdf",
        "compress": "compress-pdf",
        "security": "sanitize-pdf",
        "sanitize": "sanitize-pdf",
        "clean": "sanitize-pdf",
        "ocr": "ocr-pdf",
        "text-recognition": "ocr-pdf",
        "split": "split-pdf-by-size-or-count",
        "divide": "split-pdf-by-size-or-count",
        "merge": "merge-pdfs",
        "combine": "merge-pdfs",
        "join": "merge-pdfs",
        "rotate": "rotate-pdf",
        "turn": "rotate-pdf",
        "flatten": "flatten",
        "watermark": "add-watermark",
        "stamp": "add-watermark",
        "convert": "pdf-to-img",
        "image": "pdf-to-img",
        "extract": "extract-images",
        "permissions": "change-permissions",
        "protect": "change-permissions",
        "password": "add-password",
        "encrypt": "add-password",
    }

    fixed_operations = []
    warnings = []

    for op in operations:
        operation_id = op.get("operation", "")

        # Layer 1: Exact match
        if operation_id in tool_ids:
            fixed_operations.append(op)
            continue

        # Layer 2: Fuzzy match by operation ID
        normalized_op = operation_id.lower().replace("-", "").replace("_", "")
        matched = False

        for fuzzy_key, correct_id in fuzzy_matches.items():
            fuzzy_normalized = fuzzy_key.replace("-", "").replace("_", "")
            if fuzzy_normalized in normalized_op or normalized_op in fuzzy_normalized:
                if correct_id in tool_ids:
                    warnings.append(f"Matched '{operation_id}' to '{correct_id}'")
                    op["operation"] = correct_id
                    fixed_operations.append(op)
                    matched = True
                    break

        if matched:
            continue

        # Layer 3: Try matching by tool name
        for tool in available_tools:
            if operation_id.lower() in tool.name.lower() or tool.name.lower() in operation_id.lower():
                warnings.append(f"Matched '{operation_id}' to '{tool.id}' by name similarity")
                op["operation"] = tool.id
                fixed_operations.append(op)
                matched = True
                break

        if not matched:
            # Operation couldn't be matched
            warnings.append(f"Unknown operation '{operation_id}' - removed from workflow")

    return fixed_operations, warnings


def create_smart_folder_config(request: SmartFolderCreateRequest) -> SmartFolderCreateResponse:
    """
    Generate a smart folder configuration from natural language description.

    Returns SmartFolderCreateResponse.
    """
    # Build tool list for the AI
    tool_list = "\n".join(f"- {tool.id}: {tool.name}" for tool in request.available_tools)
    system_prompt = smart_folder_system_prompt(tool_list)

    messages = [
        ChatMessage(role="system", content=system_prompt),
        *request.history[-6:],
        ChatMessage(
            role="user",
            content=f"User request: {request.message}",
        ),
    ]

    result = run_ai(
        SMART_MODEL,
        messages,
        SmartFolderCreateResponse,
        tag="smart_folder_create",
        log_label="smart-folder-create",
        log_exchange=True,
    )

    # Validate and fix operations if config was generated
    if result.smart_folder_config and result.smart_folder_config.automation.operations:
        operations_dicts = [
            {"operation": op.operation, "parameters": op.parameters}
            for op in result.smart_folder_config.automation.operations
        ]

        fixed_ops, warnings = validate_and_fix_operations(operations_dicts, request.available_tools)

        # Update operations with validated versions
        result.smart_folder_config.automation.operations = [
            SmartFolderOperation(operation=op["operation"], parameters=op["parameters"]) for op in fixed_ops
        ]

        # If operations were removed or changed, update assistant message
        if warnings:
            warning_text = "\n\n⚠️ Note: " + "; ".join(warnings)
            result.assistant_message += warning_text

    return result
