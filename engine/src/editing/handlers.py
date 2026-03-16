import json
import logging
import mimetypes
import os
import uuid
from pathlib import Path

from flask import jsonify
from flask.typing import ResponseReturnValue
from werkzeug.datastructures import FileStorage
from werkzeug.security import safe_join

import analytics
import models
from config import OUTPUT_DIR
from file_processing_agent import ToolCatalogService

from .constants import assess_plan_risk, get_operation_risk
from .decisions import (
    answer_edit_info,
    classify_edit_intent,
)
from .operations import (
    answer_pdf_question,
    apply_smart_defaults,
    build_pdf_text_context,
    build_plan_summary,
    create_session_file,
    format_disambiguation_question,
    get_pdf_preflight,
    sanitize_filename,
    validate_operation_chain,
)
from .session_store import EditSession, EditSessionFile, EditSessionStore, PendingOperation, PendingPlan
from .state_router import route_message

logger = logging.getLogger(__name__)


class EditService:
    def __init__(self, session_store: EditSessionStore, tool_catalog: ToolCatalogService) -> None:
        self.sessions = session_store
        self.tool_catalog = tool_catalog
        self.edit_upload_dir = os.path.join(OUTPUT_DIR, "uploads")

    def _strip_file_context_history(self, messages: list[models.ChatMessage]) -> list[models.ChatMessage]:
        filtered: list[models.ChatMessage] = []
        for msg in messages:
            content = msg.content
            if isinstance(content, list):
                new_content = [
                    item for item in content if not (isinstance(item, dict) and item.get("type") == "file_context")
                ]
                if not new_content:
                    continue
                if new_content == content:
                    filtered.append(msg)
                else:
                    filtered.append(models.ChatMessage(role=msg.role, content=new_content))
            else:
                filtered.append(msg)
        return filtered

    def _build_status_response(self, session: EditSession) -> ResponseReturnValue:
        if session.file_path:
            filename = os.path.relpath(session.file_path, OUTPUT_DIR)
            response = models.EditMessageResponse(
                assistant_message="",
                result_file_url=f"/output/{filename}",
                result_file_name=session.file_name,
                result_files=[models.EditResultFile(url=f"/output/{filename}", name=session.file_name)],
            )
            return jsonify(response.model_dump(by_alias=True, exclude_none=True))
        response = models.EditMessageResponse(assistant_message="")
        return jsonify(response.model_dump(by_alias=True, exclude_none=True))

    def _primary_file(self, session: EditSession) -> EditSessionFile | None:
        if session.files:
            return session.files[0]
        if session.file_path:
            return EditSessionFile(
                file_id="primary",
                file_path=session.file_path,
                file_name=session.file_name,
                file_type=session.file_type,
                preflight=session.preflight,
            )
        return None

    def _ensure_file_context(self, session: EditSession) -> None:
        if not session.file_path:
            return
        if session.file_context and session.file_context_path == session.file_path:
            return
        context = build_pdf_text_context(session.file_path)
        session.file_context = context
        session.file_context_path = session.file_path
        message = models.ChatMessage(role="assistant", content=[context])
        for index in range(len(session.messages) - 1, -1, -1):
            if session.messages[index].role == "user":
                session.messages.insert(index, message)
                return
        session.messages.append(message)

    def create_session(self, files: list[FileStorage]) -> ResponseReturnValue:
        if not files:
            return jsonify({"error": "Missing file upload"}), 400

        session_id = str(uuid.uuid4())
        session_files: list[EditSessionFile] = []

        for index, file in enumerate(files):
            original_name = sanitize_filename(file.filename or f"upload-{index + 1}.pdf")
            extension = Path(original_name).suffix or ".pdf"
            if extension.lower() != ".pdf":
                return jsonify({"error": "Only PDF files are supported right now."}), 400
            session_dir = os.path.join(OUTPUT_DIR, session_id)
            os.makedirs(session_dir, exist_ok=True)
            file_path = os.path.join(session_dir, original_name)
            file.save(file_path)

            # Create session file with proper type detection and preflight
            session_file = create_session_file(
                file_path=file_path,
                file_name=original_name,
                content_type=file.mimetype,
                content_disposition=None,
            )
            session_files.append(session_file)

        primary = session_files[0]
        session = EditSession(
            session_id=session_id,
            file_path=primary.file_path,
            file_name=primary.file_name,
            file_type=primary.file_type,
            preflight=primary.preflight,
            files=session_files,
        )
        self.sessions.set(session)

        page_counts = [
            page_count for item in session_files if isinstance((page_count := item.preflight.page_count), int)
        ]
        size_values = [
            file_size_mb
            for item in session_files
            if isinstance((file_size_mb := item.preflight.file_size_mb), (int, float))
        ]
        analytics.track_event(
            user_id=session_id,
            event_name="edit_session_created",
            properties={
                "session_id": session_id,
                "file_count": len(session_files),
                "total_pages": sum(page_counts),
                "total_size_mb": round(sum(size_values), 2),
                "has_text_layer": any(item.preflight.has_text_layer for item in session_files),
                "has_encrypted": any(item.preflight.is_encrypted for item in session_files),
            },
        )

        response = models.EditSessionResponse(
            session_id=session_id,
            file_name=primary.file_name,
            file_type=primary.file_type,
        )
        return jsonify(response.model_dump(by_alias=True, exclude_none=True))

    def add_attachment(self, session_id: str, name: str | None, file: FileStorage | None) -> ResponseReturnValue:
        session = self.sessions.get(session_id)
        if not session:
            return jsonify({"error": "Edit session not found"}), 404
        if not file or not name:
            return jsonify({"error": "Missing attachment or name"}), 400

        original_name = sanitize_filename(file.filename or "attachment")
        file_type = file.mimetype or mimetypes.guess_type(original_name)[0]
        extension = Path(original_name).suffix or ""
        attachment_id = uuid.uuid4().hex
        stored_name = f"{session_id}-attachment-{attachment_id}{extension}"
        os.makedirs(self.edit_upload_dir, exist_ok=True)
        file_path = safe_join(self.edit_upload_dir, stored_name)
        if file_path is None:
            return jsonify({"error": "Invalid file path"}), 400
        file.save(file_path)

        session.attachments[name] = EditSessionFile(
            file_id=attachment_id,
            file_path=file_path,
            file_name=original_name,
            file_type=file_type,
        )
        return jsonify({"name": name, "file_name": original_name})

    def handle_message(self, session_id: str, payload: models.EditMessageRequest) -> ResponseReturnValue:
        session = self.sessions.get(session_id)
        if not session:
            return jsonify({"error": "Edit session not found"}), 404

        user_message = payload.message.strip()
        if not user_message:
            return jsonify({"error": "Message is required"}), 400

        if payload.action == "status":
            return self._build_status_response(session)

        if payload.action in {"confirm", "cancel"} and not session.pending_plan:
            response = models.EditMessageResponse(assistant_message="")
            return jsonify(response.model_dump(by_alias=True, exclude_none=True))

        # Add user message to history
        session.messages.append(models.ChatMessage(role="user", content=user_message))

        # NEW: Use state router for pending plan handling
        if session.pending_plan:
            routing_result = route_message(
                session,
                user_message,
                self._strip_file_context_history(session.messages),
            )

            if routing_result.action == "execute":
                if routing_result.plan is None:
                    assistant_message = "The pending plan could not be found. Please try again."
                    session.messages.append(models.ChatMessage(role="assistant", content=assistant_message))
                    response = models.EditMessageResponse(assistant_message=assistant_message)
                    return jsonify(response.model_dump(by_alias=True, exclude_none=True)), 500
                # Consume the plan immediately to avoid duplicate confirm requests
                session.pending_plan = None
                # Execute the pending plan
                return self._execute_pending_plan(session, routing_result.plan)

            elif routing_result.action == "cancelled":
                assistant_message = routing_result.message or "Cancelled. Let me know if you want to do something else."
                # Consume the plan immediately to avoid duplicate cancel requests
                session.pending_plan = None
                session.messages.append(models.ChatMessage(role="assistant", content=assistant_message))
                response = models.EditMessageResponse(assistant_message=assistant_message)
                return jsonify(response.model_dump(by_alias=True, exclude_none=True))

            elif routing_result.action == "answer_question":
                assistant_message = routing_result.message or "Please confirm to proceed or cancel to stop."
                session.messages.append(models.ChatMessage(role="assistant", content=assistant_message))
                response = models.EditMessageResponse(assistant_message=assistant_message)
                return jsonify(response.model_dump(by_alias=True, exclude_none=True))

            elif routing_result.action == "already_executed":
                assistant_message = routing_result.message or "This plan has already been executed."
                session.messages.append(models.ChatMessage(role="assistant", content=assistant_message))
                response = models.EditMessageResponse(assistant_message=assistant_message)
                return jsonify(response.model_dump(by_alias=True, exclude_none=True))

            elif routing_result.action == "route_fresh":
                # Clear pending and continue to fresh request handling below
                session.pending_plan = None

            elif routing_result.action == "error":
                assistant_message = routing_result.error or "Something went wrong. Please try again."
                session.messages.append(models.ChatMessage(role="assistant", content=assistant_message))
                response = models.EditMessageResponse(assistant_message=assistant_message)
                return jsonify(response.model_dump(by_alias=True, exclude_none=True)), 500

        # Repeat request handling - use atomic execution for consistency
        if session.last_operation_id and self._is_repeat_request(user_message):
            operation_id = session.last_operation_id
            param_model = self.tool_catalog.get_operation(operation_id)
            if not param_model:
                session.last_operation_id = None
                session.last_parameters = None
            else:
                parameters = apply_smart_defaults(
                    user_message,
                    session.last_parameters or param_model.model_validate({}),
                )

                # Create plan and execute atomically (same as new requests)
                plan = PendingPlan(
                    state="AWAITING_CONFIRM",
                    ops=[PendingOperation(operation_id=operation_id, parameters=parameters)],
                    risk_level="low",
                    risk_reasons=[],
                    source_message=user_message,
                )

                return self._execute_pending_plan(session, plan)

        intent = payload.edit_intent
        if not intent:
            intent = classify_edit_intent(
                user_message,
                self._strip_file_context_history(session.messages),
                session_id=session.session_id,
            )
        if intent and intent.mode == "document_question":
            primary = self._primary_file(session)
            if not primary:
                assistant_message = "I couldn't find a file in this session. Please upload a PDF first."
            elif primary.preflight.has_text_layer is False:
                assistant_message = "I couldn't read text in this PDF. Want me to run OCR first?"
            else:
                self._ensure_file_context(session)
                assistant_message = answer_pdf_question(primary.file_path, user_message)
            session.messages.append(models.ChatMessage(role="assistant", content=assistant_message))
            response = models.EditMessageResponse(assistant_message=assistant_message)
            return jsonify(response.model_dump(by_alias=True, exclude_none=True))

        if intent and intent.mode in {"info", "ambiguous"}:
            if intent.mode == "info":
                if intent.requires_file_context:
                    self._ensure_file_context(session)
                    primary = self._primary_file(session)
                    if primary:
                        assistant_message = answer_pdf_question(primary.file_path, user_message)
                    else:
                        assistant_message = "I couldn't find a file in this session. Please upload a PDF first."
                else:
                    assistant_message = answer_edit_info(
                        user_message,
                        self._strip_file_context_history(session.messages),
                        session.file_name,
                        session.file_type,
                        self.tool_catalog,
                        session_id=session.session_id,
                    )
            else:
                assistant_message = "Do you want me to run a tool on this file, or just explain the options?"
            session.messages.append(models.ChatMessage(role="assistant", content=assistant_message))
            response = models.EditMessageResponse(assistant_message=assistant_message, needs_more_info=True)
            return jsonify(response.model_dump(by_alias=True, exclude_none=True))

        if intent and intent.requires_file_context:
            self._ensure_file_context(session)

        selection_history = (
            session.messages
            if intent and intent.requires_file_context
            else self._strip_file_context_history(session.messages)
        )
        selection = self.tool_catalog.select_edit_tool(
            history=selection_history,
            uploaded_files=[
                models.UploadedFileInfo(name=item.file_name, type=item.file_type) for item in session.files
            ],
            preflight=session.preflight,
            session_id=session.session_id,
        )

        logger.info(
            "[EDIT] selection action=%s operation_ids=%s",
            selection.action,
            selection.operation_ids,
        )

        selected_ops = self._selection_operations(session, selection, user_message, selection_history)
        analytics.track_event(
            user_id=session.session_id,
            event_name="edit_tool_selected",
            properties={
                "session_id": session.session_id,
                "selection_action": selection.action,
                "operation_ids": [op_id for op_id, _ in selected_ops],
                "operation_count": len(selected_ops),
                "intent_mode": intent.mode if intent else None,
                "has_file_context": bool(intent and intent.requires_file_context),
            },
        )
        if selection.action == "call_tool" and not selected_ops:
            logger.warning(
                "[EDIT] selection has no operations session_id=%s message=%s payload=%s",
                session.session_id,
                user_message,
                json.dumps(selection.model_dump(), ensure_ascii=True),
            )
            assistant_message = format_disambiguation_question()
            session.messages.append(models.ChatMessage(role="assistant", content=assistant_message))
            response = models.EditMessageResponse(
                assistant_message=assistant_message,
                needs_more_info=True,
            )
            return jsonify(response.model_dump(by_alias=True, exclude_none=True))
        logger.info(
            "[EDIT] selected_ops session_id=%s count=%s ops=%s",
            session.session_id,
            len(selected_ops),
            [op_id for op_id, _ in selected_ops],
        )

        if selection.action == "ask_user":
            if not selected_ops:
                assistant_message = selection.response_message or "I could not find a matching tool for that request."
                session.messages.append(models.ChatMessage(role="assistant", content=assistant_message))
                response = models.EditMessageResponse(assistant_message=assistant_message, needs_more_info=True)
                return jsonify(response.model_dump(by_alias=True, exclude_none=True))

            # Use _handle_selected_ops for consistency - it handles missing params and PendingPlan creation
            return self._handle_selected_ops(
                selected_ops,
                user_message=user_message,
                session=session,
                response_message=selection.response_message,
            )

        if selection.action != "call_tool" or not selected_ops:
            assistant_message = selection.response_message or "I could not find a matching tool for that request."
            logger.info(
                "[EDIT] no_tool/no_ops action=%s message=%s",
                selection.action,
                assistant_message[:100] if assistant_message else None,
            )
            session.messages.append(models.ChatMessage(role="assistant", content=assistant_message))
            response = models.EditMessageResponse(assistant_message=assistant_message)
            return jsonify(response.model_dump(by_alias=True, exclude_none=True))

        return self._handle_selected_ops(
            selected_ops,
            user_message=user_message,
            session=session,
            response_message=selection.response_message,
        )

    def _execute_pending_plan(self, session: EditSession, plan: PendingPlan) -> ResponseReturnValue:
        """
        Convert pending plan into frontend-executable tool calls.
        Marks plan as executed for idempotency.
        """
        # Check idempotency
        if plan.plan_id in session.executed_plan_ids:
            assistant_message = "This operation has already been executed."
            session.messages.append(models.ChatMessage(role="assistant", content=assistant_message))
            response = models.EditMessageResponse(assistant_message=assistant_message)
            return jsonify(response.model_dump(by_alias=True, exclude_none=True))

        tool_calls: list[models.EditToolCall] = []
        for pending_op in plan.ops:
            param_model = self.tool_catalog.get_operation(pending_op.operation_id)
            if not param_model:
                continue
            tool_calls.append(
                models.EditToolCall(
                    operation_id=pending_op.operation_id,
                    parameters=pending_op.parameters,
                )
            )

        if not tool_calls:
            assistant_message = "I could not build a runnable tool plan. Please try rephrasing the request."
            session.messages.append(models.ChatMessage(role="assistant", content=assistant_message))
            response = models.EditMessageResponse(assistant_message=assistant_message)
            return jsonify(response.model_dump(by_alias=True, exclude_none=True)), 500

        session.executed_plan_ids.add(plan.plan_id)
        session.pending_plan = None

        if plan.ops:
            session.last_operation_id = plan.ops[-1].operation_id
            session.last_parameters = plan.ops[-1].parameters

        execution_mode = "single" if len(tool_calls) == 1 else "pipeline"
        pipeline_name = "AI Generated Pipeline" if execution_mode == "pipeline" else None

        analytics.track_event(
            user_id=session.session_id,
            event_name="edit_plan_emitted_for_frontend_execution",
            properties={
                "session_id": session.session_id,
                "operation_ids": [op.operation_id for op in plan.ops],
                "operation_count": len(plan.ops),
                "risk_level": plan.risk_level,
                "risk_reasons_count": len(plan.risk_reasons),
                "execution_mode": execution_mode,
            },
        )

        session.messages.append(models.ChatMessage(role="assistant", content="Prepared tool plan for frontend"))

        response = models.EditMessageResponse(
            assistant_message="",
            tool_calls=tool_calls,
            execute_on_frontend=True,
            frontend_plan=models.FrontendExecutionPlan(
                mode=execution_mode,
                steps=[
                    models.FrontendExecutionStep(
                        operation_id=call.operation_id,
                        parameters=call.parameters,
                    )
                    for call in tool_calls
                ],
                pipeline_name=pipeline_name,
            ),
        )
        return jsonify(response.model_dump(by_alias=True, exclude_none=True))

    def _selection_operations(
        self,
        session: EditSession,
        selection: models.EditToolSelection,
        user_message: str,
        history: list[models.ChatMessage],
    ) -> list[tuple[models.tool_models.OperationId, models.tool_models.ParamToolModel | None]]:
        ops: list[tuple[models.tool_models.OperationId, models.tool_models.ParamToolModel | None]] = []
        for operation_id in selection.operation_ids:
            param_model = self.tool_catalog.get_operation(operation_id)
            if not param_model:
                continue
            params = self.tool_catalog.extract_operation_parameters(
                operation_id=operation_id,
                previous_operations=ops,
                user_message=user_message,
                history=history,
                preflight=session.preflight,
                session_id=session.session_id,
            )
            ops.append((operation_id, params))
        return ops

    def _is_repeat_request(self, message: str) -> bool:
        value = message.strip().lower()

        # Don't treat as repeat if user is requesting new/additional actions
        # E.g., "compress and rotate again", "make it smaller, and rotate again"
        action_words = [
            "compress",
            "optimize",
            "smaller",
            "larger",
            "bigger",
            "rotate",
            "split",
            "merge",
            "delete",
            "extract",
            "add",
            "remove",
            "convert",
            "repair",
            "unlock",
            "watermark",
            "sign",
            "flatten",
            "ocr",
            "searchable",
            "linearize",
            "grayscale",
        ]
        if any(action in value for action in action_words):
            # If message contains action words, parse it as a new request, not a repeat
            return False

        # Only treat as repeat if it's JUST asking to repeat with no new actions
        return any(
            phrase in value
            for phrase in (
                "do that again",
                "do it again",
                "repeat that",
                "repeat it",
                "redo that",
                "redo it",
                "same again",
                "run again",
                "try again",
            )
        )

    def _handle_selected_ops(
        self,
        selected_ops: list[tuple[models.tool_models.OperationId, models.tool_models.ParamToolModel | None]],
        user_message: str,
        session: EditSession,
        *,
        response_message: str | None = None,
    ) -> ResponseReturnValue:
        """
        Handle selected operations using execution and parameter completion.
        Creates PendingPlan and routes through state machine.
        """
        # Refresh preflight for up-to-date metadata (only for PDFs)
        if session.files and session.files[0].file_path:
            if session.files[0].file_type == "application/pdf":
                session.preflight = get_pdf_preflight(session.files[0].file_path)
            else:
                session.preflight = models.PdfPreflight()

        # Process each operation (first pass without forcing defaults)
        pending_ops: list[PendingOperation] = []
        operations: list[models.tool_models.OperationId] = []

        for operation_id, raw_parameters in selected_ops:
            param_model = self.tool_catalog.get_operation(operation_id)
            if not param_model:
                assistant_message = "I could not find that tool. Please try another request."
                session.messages.append(models.ChatMessage(role="assistant", content=assistant_message))
                response = models.EditMessageResponse(assistant_message=assistant_message)
                return jsonify(response.model_dump(by_alias=True, exclude_none=True))

            operations.append(operation_id)

            # Apply defaults
            parameters = apply_smart_defaults(
                user_message,
                raw_parameters or param_model.model_validate({}),
            )

            pending_ops.append(PendingOperation(operation_id=operation_id, parameters=parameters))

        # Validate operation chain compatibility
        validation = validate_operation_chain(operations)
        if not validation.is_valid:
            error_msg = validation.error_message or "Incompatible operation chain"
            session.messages.append(models.ChatMessage(role="assistant", content=error_msg))
            # Return structured data for frontend to format with translated names
            response = models.EditMessageResponse(
                assistant_message="",  # Frontend will format from validation_error
                result_json=(
                    {"validation_error": validation.error_data.model_dump(by_alias=True, mode="json")}
                    if validation.error_data
                    else None
                ),
            )
            return jsonify(response.model_dump(by_alias=True, exclude_none=True)), 400

        # No missing params - assess risk
        risk_assessment = assess_plan_risk(operations, session.preflight)

        # Create pending plan or execute immediately
        if risk_assessment.get("should_confirm"):
            # Need confirmation - create AWAITING_CONFIRM plan
            plan = PendingPlan(
                state="AWAITING_CONFIRM",
                ops=pending_ops,
                risk_level=risk_assessment["level"],
                risk_reasons=risk_assessment.get("reasons", []),
                source_message=user_message,
            )
            session.pending_plan = plan

            plan_summary = build_plan_summary(operations)
            plan_summary += "\n\nConfirm to proceed or cancel to stop."

            session.messages.append(models.ChatMessage(role="assistant", content=plan_summary))

            # Build tool calls for preview
            tool_calls = [
                models.EditToolCall(
                    operation_id=op.operation_id,
                    parameters=op.parameters,
                )
                for op in pending_ops
            ]

            # Get warning if high risk
            warning = None
            if len(operations) == 1:
                op_risk = get_operation_risk(operations[0], session.preflight)
                warning = op_risk.get("warning")

            response = models.EditMessageResponse(
                assistant_message=plan_summary,
                confirmation_required=True,
                warning=warning,
                tool_calls=tool_calls,
            )
            return jsonify(response.model_dump(by_alias=True, exclude_none=True))

        # Low risk - execute immediately using atomic execution
        plan = PendingPlan(
            state="AWAITING_CONFIRM",  # Use confirm state but execute immediately
            ops=pending_ops,
            risk_level=risk_assessment["level"],
            risk_reasons=risk_assessment.get("reasons", []),
            source_message=user_message,
        )

        return self._execute_pending_plan(session, plan)
