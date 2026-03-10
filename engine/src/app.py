import json
import mimetypes
import os
import re
import time
import urllib.error
import urllib.request
import uuid
from typing import Literal

from flask import Flask, Response, jsonify, request, send_file, stream_with_context
from flask_cors import CORS
from pydantic import BaseModel

import analytics
import models
from ai_generation import generate_field_values
from briefs import _preprocess_intent
from chat_router import classify_chat_route
from config import (
    ASSETS_DIR,
    FAST_MODEL,
    JAVA_BACKEND_API_KEY,
    JAVA_REQUEST_TIMEOUT_SECONDS,
    OUTPUT_DIR,
    SMART_MODEL,
    logger,
    model_max_tokens,
)
from document_types import detect_document_type
from editing import register_edit_routes
from editing.decisions import answer_conversational_info
from file_processing_agent import ToolCatalogService
from html_pdf_utils import compile_html_to_pdf
from html_utils import inject_theme
from java_client import java_headers, java_url
from llm_utils import run_ai
from pdf_generator import _DEFAULT_TEMPLATES_DIR, PDFGenerator
from pdf_text_editor import convert_pdf_to_text_editor_document
from prompts import (
    generate_all_sections_system_prompt,
    pdf_qa_system_prompt,
    section_fill_system_prompt,
)
from smart_folder_creator import create_smart_folder_config
from storage import load_versions

app = Flask(__name__)
CORS(app)
_tool_catalog_service = ToolCatalogService()
register_edit_routes(app)


@app.before_request
def log_job_request_sequence() -> None:
    job_id = request.headers.get("X-Job-Id")
    if not job_id:
        return
    seq = request.headers.get("X-Job-Seq", "?")
    total = request.headers.get("X-Job-Total", "?")
    logger.info("[HTTP] job_id=%s req=%s/%s %s %s", job_id, seq, total, request.method, request.path)


def _json_body[T: BaseModel](model: type[T], request_type: Literal["GET", "POST"] = "POST") -> T:
    if request_type == "GET":
        payload = request.args.to_dict()
    else:
        payload = request.get_json(silent=True)
    return model.model_validate(payload or {})


def _java_request_json[T: BaseModel](
    method: str,
    path: str,
    payload: BaseModel | None,
    response_model: type[T],
) -> T:
    url = java_url(path)
    data = None
    headers = java_headers()
    headers["Content-Type"] = "application/json"
    if payload is not None:
        payload_data = payload.model_dump(by_alias=True, exclude_none=True)
        data = json.dumps(payload_data).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=JAVA_REQUEST_TIMEOUT_SECONDS) as resp:
            body = resp.read().decode("utf-8")
            parsed = json.loads(body) if body else {}
            return response_model.model_validate(parsed)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8") if exc.fp else ""
        logger.error("[JAVA] %s %s failed status=%s detail=%s", method, path, exc.code, detail)
        raise


def _fetch_ai_session(session_id: str):
    auth_header = request.headers.get("Authorization")
    api_key = request.headers.get("X-API-KEY")
    if auth_header or api_key:
        path = f"/api/v1/ai/create/sessions/{session_id}"
    elif JAVA_BACKEND_API_KEY:
        path = f"/api/v1/ai/create/internal/sessions/{session_id}"
    else:
        path = f"/api/v1/ai/create/sessions/{session_id}"
    return _java_request_json("GET", path, None, models.AISession)


def _update_ai_session(session_id: str, payload: models.JavaUpdateSessionRequest):
    return _java_request_json(
        "POST", f"/api/v1/ai/create/internal/sessions/{session_id}/update", payload, models.AISession
    )


@app.route("/api/intent/check", methods=["POST"])
def intent_check():
    payload = _json_body(models.IntentCheckRequest)
    prompt = payload.prompt
    history = payload.conversation_history
    current_pdf_url = payload.current_pdf_url
    intent = _preprocess_intent(prompt, history, bool(current_pdf_url))
    response = intent.model_copy(update={"doc_type": intent.document_type, "has_pdf": bool(current_pdf_url)})
    return jsonify(response.model_dump(by_alias=True, exclude_none=True))


@app.route("/api/chat/route", methods=["POST"])
def chat_route():
    payload = _json_body(models.ChatRouteRequest)
    decision = classify_chat_route(payload)
    return jsonify(decision.model_dump(by_alias=True, exclude_none=True))


@app.route("/api/chat/create-smart-folder", methods=["POST"])
def create_smart_folder():
    payload = _json_body(models.SmartFolderCreateRequest)
    result = create_smart_folder_config(payload)
    return jsonify(result.model_dump(by_alias=True, exclude_none=True))


@app.route("/api/chat/interpret-parameter", methods=["POST"])
def interpret_parameter():
    """Use AI to interpret an ambiguous parameter response during Tier 2 workflow collection."""
    payload = _json_body(models.InterpretParameterRequest)
    system_prompt = (
        "You are a parameter extraction assistant for a PDF tool workflow.\n"
        "Given a question asked to the user and the user's response, decide how to interpret it.\n\n"
        "Return JSON with these fields:\n"
        '- "type": one of "value", "confused", "cancel", "default"\n'
        '  - "value": the user gave a usable answer, extract it cleanly\n'
        '  - "confused": the user is asking for help or does not understand\n'
        '  - "cancel": the user wants to stop or cancel\n'
        '  - "default": the user is vague; suggest the most sensible default\n'
        '- "extracted_value": the clean extracted value (only for type="value" or type="default")\n'
        '- "help_message": a short helpful message explaining what was interpreted or what options exist\n\n'
        'Be concise. For type="value", extracted_value should be just the raw value (e.g. "English", "3", "DOCX").\n'
        'For type="default", extracted_value should be the suggested default value.'
    )
    user_prompt = (
        f"Tool: {payload.tool_name}\nQuestion asked: {payload.question}\nUser response: {payload.user_response}"
    )
    messages = [
        models.ChatMessage(role="system", content=system_prompt),
        models.ChatMessage(role="user", content=user_prompt),
    ]
    result = run_ai(
        FAST_MODEL,
        messages,
        models.InterpretParameterResponse,
        tag="interpret_parameter",
        log_label="interpret-parameter",
    )
    return jsonify(result.model_dump(by_alias=True, exclude_none=True))


@app.route("/api/chat/infer-tools", methods=["POST"])
def infer_tools():
    """Use AI to infer which PDF tools to apply from a freeform user message."""
    payload = _json_body(models.InferToolsRequest)
    tools_list = "\n".join(f"- {t}" for t in payload.available_tools)
    system_prompt = (
        "You are a tool selection assistant for Stirling PDF.\n"
        "Given a user message, identify which PDF tools to apply to achieve the user's goal.\n"
        "Return tools in the execution order.\n\n"
        "Rules:\n"
        "- Only return tools with HIGH confidence — leave out anything uncertain\n"
        "- Return empty list if the request is a question, ambiguous, or conversational\n"
        "- Return empty list if the request is about creating a new document\n"
        "- Maximum 4 tools\n\n"
        f"Available tools (format: 'id: Display Name'):\n{tools_list}\n\n"
        'Return JSON: { "tools": [{"tool_id": "...", "confidence": "high"|"medium"|"low"}], "reason": "..." }\n'
        'IMPORTANT: tool_id must be the exact identifier before the colon (e.g. "convert", not "convert: Convert PDF").'
    )
    messages_list = [
        models.ChatMessage(role="system", content=system_prompt),
        models.ChatMessage(role="user", content=f"User message: {payload.message}"),
    ]
    result = run_ai(
        FAST_MODEL,
        messages_list,
        models.InferToolsResponse,
        tag="infer_tools",
        log_label="infer-tools",
    )
    filtered = models.InferToolsResponse(
        tools=[t for t in result.tools if t.confidence == "high"],
        reason=result.reason,
    )
    return jsonify(filtered.model_dump(by_alias=True, exclude_none=True))


@app.route("/api/chat/info", methods=["POST"])
def chat_info():
    """Handle conversational queries without requiring a file or session."""
    payload = _json_body(models.ChatInfoRequest)
    tool_catalog = ToolCatalogService()
    assistant_message = answer_conversational_info(
        payload.message,
        payload.history,
        tool_catalog,
    )
    response = models.ChatInfoResponse(assistant_message=assistant_message)
    return jsonify(response.model_dump(by_alias=True, exclude_none=True))


@app.route("/api/detect_type", methods=["POST"])
def detect_type():
    """
    Detect document type from a prompt using a fast AI model.

    This endpoint uses a cheap/fast model (FAST_MODEL) for AI classification
    to minimize cost and latency.

    Request body:
        - prompt: The user's document request
        - explicitType: If provided, skip detection and return this type

    Response:
        - docType: The detected type
        - confidence: "medium" (AI), "low" (AI)
        - method: "explicit" or "ai"
    """
    payload = _json_body(models.DetectTypeRequest)
    prompt = payload.prompt
    explicit_type = payload.explicit_type or ""

    # If user explicitly provided a type, skip detection
    if explicit_type and explicit_type not in ("other", "document", "miscellaneous", ""):
        logger.info("[DETECT] Using explicit doc_type=%s, skipping detection", explicit_type)
        response = models.DetectTypeResponse(doc_type=explicit_type, confidence="high", method="explicit")
        return jsonify(response.model_dump(by_alias=True, exclude_none=True))

    if not prompt:
        response = models.DetectTypeResponse(error="Missing prompt for detection")
        return jsonify(response.model_dump(by_alias=True, exclude_none=True)), 400

    # Use fast AI detection (uses FAST_MODEL for cheap classification)
    ai_type, confidence = detect_document_type(prompt, confidence_threshold=0.7)
    logger.info("[DETECT] Fast AI detected doc_type=%s (confidence=%.2f)", ai_type, confidence)
    response = models.DetectTypeResponse(
        doc_type=ai_type or "other",
        confidence="medium" if confidence >= 0.7 else "low",
        method="ai",
    )
    return jsonify(response.model_dump(by_alias=True, exclude_none=True))


@app.route("/api/pdf/answer", methods=["POST"])
def pdf_answer():
    payload = _json_body(models.PdfAnswerRequest)
    pdf_url = payload.pdf_url
    question = payload.question
    if not pdf_url or not question:
        response = models.PdfAnswerResponse(error="Missing pdfUrl or question")
        return jsonify(response.model_dump(by_alias=True, exclude_none=True)), 400

    filename = os.path.basename(pdf_url.split("?")[0])
    if not filename.lower().endswith(".pdf"):
        response = models.PdfAnswerResponse(error="Invalid pdf file")
        return jsonify(response.model_dump(by_alias=True, exclude_none=True)), 400

    pdf_path = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(pdf_path):
        response = models.PdfAnswerResponse(error="PDF not found")
        return jsonify(response.model_dump(by_alias=True, exclude_none=True)), 404

    doc = convert_pdf_to_text_editor_document(pdf_path)

    pages = doc.document.pages if doc else []
    snippets: list[str] = []
    for page in pages:
        for elem in page.text_elements:
            text = elem.text
            if text:
                snippets.append(str(text))
    if not snippets:
        response = models.PdfAnswerResponse(error="No readable text in PDF")
        return jsonify(response.model_dump(by_alias=True, exclude_none=True)), 400

    # Normalize and limit context
    context = " ".join(snippets)
    context = " ".join(context.split())  # normalize whitespace
    max_context = 10000
    if len(context) > max_context:
        context = context[:max_context]

    model_name = SMART_MODEL
    system_prompt = pdf_qa_system_prompt() + "\nReturn JSON matching the provided schema."
    user_prompt = f"Question: {question}\n\nPDF text:\n{context}"
    messages = [
        models.ChatMessage(role="system", content=system_prompt),
        models.ChatMessage(role="user", content=user_prompt),
    ]
    response = run_ai(
        model_name,
        messages,
        models.PdfAnswer,
        tag="pdf_answer",
        max_tokens=220,
    )
    answer = response.answer.strip()
    title_like = re.match(r"^why pdfs|^minimalist|^author:", answer, re.IGNORECASE)
    normalized_answer = re.sub(r"\s+", " ", answer).strip().lower()
    normalized_context = re.sub(r"\s+", " ", context).strip().lower()
    copied_context = bool(normalized_answer) and normalized_answer in normalized_context
    if title_like or copied_context:
        response = models.PdfAnswerResponse(error="AI answer was invalid or echoed the source text.")
        return jsonify(response.model_dump(by_alias=True, exclude_none=True)), 500

    response = models.PdfAnswerResponse(answer=answer, mode="model")
    return jsonify(response.model_dump(by_alias=True, exclude_none=True))


@app.route("/api/create/sessions", methods=["POST"])
def create_session():
    """Create a new AI session via the Java backend."""
    create_session_request = _json_body(models.CreateSessionRequest)

    # Doc type should ideally come from chat router; fall back to detection if needed
    detection_method = "provided"
    if create_session_request.doc_type in ("miscellaneous", "other", "document", "unknown", ""):
        # Fall back to detection if doc_type not provided by chat router
        logger.info("[SESSION] No doc_type provided, running fallback detection")
        confidence_threshold = 0.7  # Only accept matches with 70%+ confidence
        detected_type, confidence = detect_document_type(
            create_session_request.prompt, confidence_threshold=confidence_threshold
        )
        if confidence >= confidence_threshold:
            logger.info(
                "[SESSION] Detected doc_type=%s from prompt (confidence=%.2f)",
                detected_type,
                confidence,
            )
            create_session_request.doc_type = detected_type
            detection_method = "fallback_detection"
        else:
            logger.info(
                "[SESSION] Detection confidence too low (%.2f < %.2f), using 'other'",
                confidence,
                confidence_threshold,
            )
            create_session_request.doc_type = "other"
            detection_method = "fallback_low_confidence"
    else:
        logger.info(
            "[SESSION] Using doc_type=%s from chat router",
            create_session_request.doc_type,
        )

    result = _java_request_json(
        "POST",
        "/api/v1/ai/create/sessions",
        create_session_request,
        models.JavaCreateSessionResponse,
    )
    session_id = result.session_id
    logger.info(
        "[SESSION] Created session %s doc_type=%s method=%s",
        session_id,
        create_session_request.doc_type,
        detection_method,
    )
    # Track session creation in PostHog
    safe_doc_type = re.sub(r"[^a-zA-Z0-9_]+", "", (create_session_request.doc_type or "").lower())
    has_html_template = (_DEFAULT_TEMPLATES_DIR / f"{safe_doc_type}.html").exists()
    analytics.track_session_created(
        user_id=session_id,
        session_id=session_id,
        doc_type=create_session_request.doc_type or "unknown",
        template_id=create_session_request.template_id,
        has_template=has_html_template,
    )

    response = models.CreateSessionResponse(
        session_id=session_id,
        doc_type=create_session_request.doc_type,
        detection_method=detection_method,
    )
    return jsonify(response.model_dump(by_alias=True, exclude_none=True))


@app.route("/api/create/sessions/<session_id>/outline", methods=["POST"])
def update_outline(session_id: str):
    """Update session with approved outline."""
    payload = _json_body(models.UpdateOutlineRequest)
    _java_request_json(
        "POST",
        f"/api/v1/ai/create/sessions/{session_id}/outline",
        payload,
        models.AISession,
    )
    response = models.SuccessResponse(success=True)
    return jsonify(response.model_dump(by_alias=True, exclude_none=True))


@app.route("/api/create/sessions/<session_id>/draft", methods=["POST"])
def update_draft(session_id: str):
    """Update session with approved draft sections."""
    payload = _json_body(models.UpdateDraftRequest)
    _java_request_json(
        "POST",
        f"/api/v1/ai/create/sessions/{session_id}/draft",
        payload,
        models.AISession,
    )
    response = models.SuccessResponse(success=True)
    return jsonify(response.model_dump(by_alias=True, exclude_none=True))


@app.route("/api/create/sessions/<session_id>/template", methods=["POST"])
def update_template(session_id: str):
    """Update session template selection."""
    payload = _json_body(models.UpdateTemplateRequest)
    _java_request_json(
        "POST",
        f"/api/v1/ai/create/sessions/{session_id}/template",
        payload,
        models.AISession,
    )
    response = models.SuccessResponse(success=True)
    return jsonify(response.model_dump(by_alias=True, exclude_none=True))


@app.route("/api/create/sessions/<session_id>/reprompt", methods=["POST"])
def reprompt_session(session_id: str):
    """Update session with new prompt."""
    payload = _json_body(models.RepromptRequest)
    _java_request_json(
        "POST",
        f"/api/v1/ai/create/sessions/{session_id}/reprompt",
        payload,
        models.AISession,
    )
    response = models.SuccessResponse(success=True)
    return jsonify(response.model_dump(by_alias=True, exclude_none=True))


@app.route("/api/create/sessions/<session_id>/stream", methods=["POST"])
def create_stream(session_id: str):
    payload = _json_body(models.CreateStreamRequest)
    session = _fetch_ai_session(session_id)
    prompt = session.prompt_latest or session.prompt_initial or ""
    doc_type = session.doc_type or "other"
    template_id = session.template_id
    outline_text = session.outline_text or ""
    outline_filename = session.outline_filename
    constraints = session.outline_constraints
    draft_sections = session.draft_sections
    logo_base64 = payload.theme.logo_base64 if payload.theme else None
    theme = payload.theme.css_overrides() if payload.theme else None
    logger.info(
        "[STREAM] session_id=%s has_theme=%s has_logo=%s",
        session_id,
        bool(theme),
        bool(logo_base64),
    )
    base_html = payload.base_html or session.polished_html or None
    handler = PDFGenerator(
        session_id=session_id,
        phase=payload.phase,
        prompt=prompt,
        doc_type=doc_type,
        template_id=template_id,
        outline_text=outline_text,
        outline_filename=outline_filename,
        constraints=constraints,
        draft_sections=draft_sections,
        update_session=_update_ai_session,
        theme=theme,
        logo_base64=logo_base64,
        base_html=base_html,
        instructions=payload.additional_instructions,
    )

    return Response(
        stream_with_context(handler.generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.route("/api/create/sessions/<session_id>/fields", methods=["POST"])
def fill_fields(session_id: str):
    logger.info("[AI create] fill_fields session_id=%s", session_id)
    session = _fetch_ai_session(session_id)

    payload = _json_body(models.FillFieldsRequest)
    fields = payload.fields
    extra_prompt = payload.extra_prompt
    if not isinstance(fields, list):
        return jsonify({"error": "Fields must be a list"}), 400

    prompt = session.prompt_latest or session.prompt_initial or ""
    if extra_prompt:
        prompt = f"{prompt}\n{extra_prompt}"
    doc_type = session.doc_type or "other"
    constraints = session.outline_constraints

    filled = generate_field_values(prompt, doc_type, fields, constraints)
    response = models.FillFieldsResponse(fields=filled)
    return jsonify(response.model_dump(by_alias=True, exclude_none=True))


@app.route("/api/generate_section", methods=["POST"])
def generate_section():
    """Generate content for a single section based on a custom prompt."""
    payload = _json_body(models.GenerateSectionRequest)
    _session_id = payload.session_id
    section_label = payload.section_label
    section_index = payload.section_index
    custom_prompt = payload.custom_prompt
    document_prompt = payload.document_prompt
    document_type = payload.doc_type
    existing_sections = payload.existing_sections

    logger.info(
        "[AI] generate_section label=%s custom_prompt=%s", section_label, custom_prompt[:50] if custom_prompt else ""
    )

    # Build context from existing sections (don't truncate - AI needs full context for calculations)
    sections_context = "\n".join([f"- {sec.label}: {sec.value}" for sec in existing_sections if sec.value])
    system_prompt = section_fill_system_prompt(
        document_type,
        document_prompt[:500],
        sections_context,
        section_label,
        custom_prompt,
    )

    messages = [
        models.ChatMessage(role="system", content=system_prompt),
        models.ChatMessage(role="user", content=f"Generate content for: {section_label}"),
    ]
    parsed = run_ai(
        SMART_MODEL,
        messages,
        models.SectionContent,
        tag="generate_section",
        max_tokens=500,
    )
    response = models.GenerateSectionResponse(content=parsed.content.strip(), section_index=section_index)
    return jsonify(response.model_dump(by_alias=True, exclude_none=True))


def _run_sections_batch(
    batch: list[tuple[int, str]],
    document_prompt: str,
    additional_prompt: str | None,
    system_prompt: str,
) -> dict[int, str]:
    sections_list = "\n".join([f"{i + 1}. {label}" for i, label in batch])
    user_prompt = (
        f"User's document request:\n{document_prompt}\n\n"
        "Generate ONLY these sections (leave others unchanged):\n"
        f"{sections_list}"
    )
    if additional_prompt:
        user_prompt = f"{user_prompt}\n\nAdditional instructions:\n{additional_prompt}"
    messages = [
        models.ChatMessage(role="system", content=system_prompt),
        models.ChatMessage(role="user", content=user_prompt),
    ]
    parsed = run_ai(
        SMART_MODEL,
        messages,
        models.LLMGenerateAllSectionsResponse,
        tag="generate_all_sections",
        max_tokens=model_max_tokens(SMART_MODEL),
    )
    return {section.index - 1: section.value for section in parsed.sections if section.value}


@app.route("/api/generate_all_sections", methods=["POST"])
def generate_all_sections():
    """Generate content for selected sections."""
    generation_start = time.time()
    payload = _json_body(models.GenerateAllSectionsRequest)
    _session_id = payload.session_id
    document_prompt = payload.document_prompt
    document_type = payload.doc_type
    current_sections = payload.sections
    only_indices = payload.only_indices  # Optional: only generate for these indices
    additional_prompt = payload.additional_prompt  # Optional: extra instructions from user

    # If onlyIndices is provided, only generate for those sections
    if only_indices is not None:
        indices_to_generate = set(only_indices)
    else:
        indices_to_generate = set(range(len(current_sections)))

    logger.info(
        "[AI] generate_all_sections doc_type=%s total_sections=%d generating=%d",
        document_type,
        len(current_sections),
        len(indices_to_generate),
    )

    if not current_sections:
        response = models.GenerateAllSectionsResponse(error="No sections provided")
        return jsonify(response.model_dump(by_alias=True, exclude_none=True)), 400

    if not indices_to_generate:
        # Nothing to generate, return sections as-is
        response = models.GenerateAllSectionsResponse(sections=current_sections)
        return jsonify(response.model_dump(by_alias=True, exclude_none=True))

    # Build the section labels list (only for sections we're generating)
    section_labels = [section.label for section in current_sections]

    # Build prompt only for sections we want to generate
    sections_to_generate = [(i, section_labels[i]) for i in sorted(indices_to_generate) if i < len(current_sections)]
    system_prompt = generate_all_sections_system_prompt(document_type)

    # Batch to avoid hitting model output token limits — each batch is a separate API call.
    batch_size = 3
    batches = [sections_to_generate[i : i + batch_size] for i in range(0, len(sections_to_generate), batch_size)]

    generated_content: dict[int, str] = {}
    failed_indices: list[int] = []

    for batch in batches:
        try:
            generated_content.update(_run_sections_batch(batch, document_prompt, additional_prompt, system_prompt))
        except Exception as batch_err:
            logger.warning(
                "[AI] generate_all_sections batch failed (%s), retrying each section individually",
                batch_err,
            )
            for item in batch:
                try:
                    generated_content.update(
                        _run_sections_batch([item], document_prompt, additional_prompt, system_prompt)
                    )
                except Exception as single_err:
                    logger.error(
                        "[AI] generate_all_sections failed for section index=%d label=%r: %s",
                        item[0],
                        item[1],
                        single_err,
                    )
                    failed_indices.append(item[0])

    # Build final sections list, keeping existing content for non-generated sections
    filled_sections = []
    for i, section in enumerate(current_sections):
        label = section.label
        if i in generated_content:
            # Use newly generated content
            filled_sections.append(models.DraftSection(label=label, value=generated_content[i]))
        else:
            # Keep existing content
            filled_sections.append(models.DraftSection(label=label, value=section.value))

    generation_duration = (time.time() - generation_start) * 1000

    # Track section generation
    analytics.track_event(
        user_id=_session_id or "unknown",
        event_name="sections_generated",
        properties={
            "session_id": _session_id,
            "doc_type": document_type,
            "total_sections": len(current_sections),
            "generated_sections": len(indices_to_generate),
            "generation_time_ms": generation_duration,
            "has_additional_prompt": bool(additional_prompt),
        },
    )

    response = models.GenerateAllSectionsResponse(
        sections=filled_sections,
        incomplete_section_indices=failed_indices if failed_indices else None,
    )
    return jsonify(response.model_dump(by_alias=True, exclude_none=True))


@app.route("/output/<path:filename>", methods=["GET"])
def serve_output_file(filename: str):
    """Serve generated PDF files and stored assets."""
    file_path = os.path.join(OUTPUT_DIR, filename)
    if os.path.exists(file_path):
        file_size = os.path.getsize(file_path)
        mime_type, _ = mimetypes.guess_type(file_path)
        logger.info("[SERVE] Serving file=%s size=%d bytes mime=%s", filename, file_size, mime_type)
        response = send_file(file_path, mimetype=mime_type or "application/pdf")
        # Add CORS headers to ensure PDF can be loaded
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET"
        return response
    logger.warning("[SERVE] File not found: %s", file_path)
    return jsonify({"error": "File not found"}), 404


@app.route("/api/versions/<user_id>", methods=["GET"])
def list_versions(user_id: str):
    response = models.VersionsResponse(versions=load_versions(user_id))
    return jsonify(response.model_dump(by_alias=True, exclude_none=True))


@app.route("/api/assets/upload", methods=["POST"])
def upload_asset():
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "Missing file"}), 400

    _, ext = os.path.splitext(file.filename or "")
    ext = ext.lower()
    if ext not in {".png", ".jpg", ".jpeg", ".gif"}:
        return jsonify({"error": "Unsupported file type"}), 400

    asset_id = f"{uuid.uuid4().hex}{ext}"
    output_path = os.path.join(ASSETS_DIR, asset_id)
    os.makedirs(ASSETS_DIR, exist_ok=True)
    file.save(output_path)

    response = models.UploadAssetResponse(
        asset_id=asset_id,
        asset_url=f"/output/assets/{asset_id}",
    )
    return jsonify(response.model_dump(by_alias=True, exclude_none=True))


@app.route("/api/templates/previews", methods=["GET"])
def list_preview_templates():
    """Return sorted list of preview template stem names."""
    stems = sorted(p.stem for p in _DEFAULT_TEMPLATES_DIR.glob("*_preview.html"))
    return jsonify({"templates": stems})


@app.route("/api/templates/preview-html", methods=["GET"])
def get_template_preview_html():
    """Return preview template HTML with default theme injected.

    Query param: template — stem name (e.g. 'invoice_preview' or 'invoice_preview.html').
    The frontend will override CSS vars via JS for live color preview.
    """
    payload = _json_body(models.PreviewTemplateHtmlRequest, "GET")
    template_param = payload.template
    if not template_param:
        return jsonify({"error": "Missing template parameter"}), 400

    # Strip .html extension if present
    stem = template_param.removesuffix(".html")
    if "_preview" not in stem:
        return jsonify({"error": "Template must be a preview template (name must contain '_preview')"}), 400

    html_path = _DEFAULT_TEMPLATES_DIR / f"{stem}.html"
    if not html_path.exists():
        return jsonify({"error": f"Template not found: {stem}"}), 404

    html = html_path.read_text(encoding="utf-8", errors="replace")
    # Inject default theme so vars are defined; frontend will override via JS
    html = inject_theme(html, None)
    return Response(html, mimetype="text/html")


@app.route("/api/templates/render-preview", methods=["POST"])
def render_preview_to_pdf():
    """Render a preview template to PDF with the given theme.

    Body: { template: str, theme: dict | None }
    Returns: PDF file download.
    """
    payload = _json_body(models.RenderPreviewRequest)
    template_param = payload.template
    theme = payload.theme.css_overrides() if payload.theme else None

    if not template_param:
        return jsonify({"error": "Missing template parameter"}), 400

    stem = template_param.removesuffix(".html")
    if "_preview" not in stem:
        return jsonify({"error": "Template must be a preview template"}), 400

    html_path = _DEFAULT_TEMPLATES_DIR / f"{stem}.html"
    if not html_path.exists():
        return jsonify({"error": f"Template not found: {stem}"}), 404

    html = html_path.read_text(encoding="utf-8", errors="replace")
    html = inject_theme(html, theme)

    job_id = f"preview/{uuid.uuid4().hex}"
    result = compile_html_to_pdf(html, job_id, log_errors=True)

    if result.pdf_path and os.path.exists(result.pdf_path):
        return send_file(result.pdf_path, mimetype="application/pdf", as_attachment=True, download_name=f"{stem}.pdf")

    return jsonify({"error": result.error or "PDF generation failed"}), 500


@app.route("/health", methods=["GET"])
def health():
    response = models.HealthResponse(status="ok", engine="puppeteer")
    return jsonify(response.model_dump(by_alias=True, exclude_none=True))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
