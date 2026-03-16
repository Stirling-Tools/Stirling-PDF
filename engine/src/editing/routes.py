import logging
import os
import subprocess
import uuid

from flask import Blueprint, jsonify, request
from werkzeug.security import safe_join

from config import OUTPUT_DIR
from file_processing_agent import ToolCatalogService
from llm_utils import AIProviderOverloadedError
from models import EditMessageRequest, PdfEditorUploadResponse
from pdf_text_editor import convert_pdf_to_text_editor_document

from .service import EditService
from .session_store import EditSessionStore

logger = logging.getLogger(__name__)

edit_blueprint = Blueprint("edit", __name__)
_edit_service = EditService(EditSessionStore(), ToolCatalogService())


def register_edit_routes(app) -> None:
    app.register_blueprint(edit_blueprint)


def _json_body(model):
    return model.model_validate(request.get_json(silent=True) or {})


@edit_blueprint.route("/api/edit/sessions", methods=["POST"])
def create_edit_session():
    files = request.files.getlist("file")
    return _edit_service.create_session(files)


@edit_blueprint.route("/api/edit/sessions/<session_id>/messages", methods=["POST"])
def edit_session_message(session_id: str):
    payload = _json_body(EditMessageRequest)
    try:
        return _edit_service.handle_message(session_id, payload)
    except AIProviderOverloadedError as exc:
        logger.warning("[EDIT] AI provider overloaded session_id=%s (exc=%s)", session_id, exc)
        response = {
            "assistantMessage": "The AI service is temporarily unavailable. Please try again later.",
            "needsMoreInfo": True,
        }
        return jsonify(response), 503


@edit_blueprint.route("/api/edit/sessions/<session_id>/attachments", methods=["POST"])
def edit_session_attachment(session_id: str):
    name = request.form.get("name")
    file = request.files.get("file")
    return _edit_service.add_attachment(session_id, name, file)


@edit_blueprint.route("/api/pdf-editor/document", methods=["GET"])
def pdf_editor_document():
    """Expose a JSON snapshot of the PDF for rich text editing."""
    pdf_url = request.args.get("pdfUrl")
    if not pdf_url:
        return jsonify({"error": "Missing pdfUrl"}), 400

    filename = os.path.basename(pdf_url.split("?")[0])
    if not filename:
        return jsonify({"error": "Invalid pdf file"}), 400
    if not filename.lower().endswith(".pdf"):
        return jsonify({"error": "Invalid pdf file"}), 400

    pdf_path = safe_join(OUTPUT_DIR, filename)
    if pdf_path is None or not os.path.exists(pdf_path):
        return jsonify({"error": "PDF not found"}), 404

    try:
        document = convert_pdf_to_text_editor_document(pdf_path)
        return jsonify(document.model_dump(by_alias=True, exclude_none=True))
    except FileNotFoundError:
        return jsonify({"error": "Conversion failed"}), 500
    except subprocess.CalledProcessError as exc:
        logger.error("[PDF-EDITOR] Conversion failed: %s", exc)
        return jsonify({"error": "Conversion failed"}), 500
    except Exception as exc:
        logger.error("[PDF-EDITOR] Unexpected conversion failure: %s", exc)
        return jsonify({"error": "Conversion failed"}), 500


@edit_blueprint.route("/api/pdf-editor/upload", methods=["POST"])
def pdf_editor_upload():
    """Accept an edited PDF and save it so the preview can refresh."""
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "Missing file"}), 400

    job_id = str(uuid.uuid4())
    filename = f"{job_id}-edited.pdf"
    output_path = os.path.join(OUTPUT_DIR, filename)
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    file.save(output_path)

    logger.info("[PDF-EDITOR] uploaded edited PDF job_id=%s -> %s", job_id, filename)
    response = PdfEditorUploadResponse(pdf_url=f"/output/{filename}")
    return jsonify(response.model_dump(by_alias=True, exclude_none=True))
