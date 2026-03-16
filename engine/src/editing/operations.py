import logging
import os
import re
import uuid
from dataclasses import dataclass
from typing import Any

from pypdf import PdfReader

from config import SMART_MODEL
from llm_utils import run_ai
from models import ChatMessage, IncompatibleChainError, OperationRef, PdfAnswer, PdfPreflight, tool_models
from pdf_text_editor import convert_pdf_to_text_editor_document
from prompts import pdf_qa_system_prompt

from .session_store import EditSessionFile

logger = logging.getLogger(__name__)


def sanitize_filename(filename: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "_", filename or "")
    return cleaned.strip("._") or "upload.pdf"


def infer_smart_defaults(
    user_message: str,
    parameters: tool_models.ParamToolModel,
) -> tool_models.ParamToolModel:
    # TODO: Get rid of this function. It only works in English and shouldn't be necessary
    params = parameters.model_copy()
    text = user_message.lower()

    if isinstance(params, tool_models.RotateParams):
        desired_angle = 90
        if any(word in text for word in ["right", "clockwise"]):
            desired_angle = 90
        elif any(word in text for word in ["left", "counter", "anticlockwise", "anti-clockwise"]):
            desired_angle = 270
        elif any(word in text for word in ["upside", "180"]):
            desired_angle = 180
        if params.angle not in {90, 180, 270}:
            params.angle = desired_angle
        return params

    if isinstance(params, tool_models.OcrParams):
        if any(word in text for word in ["searchable", "text layer", "text overlaid"]):
            params.ocr_render_type = "sandwich"
        elif any(word in text for word in ["hocr", "layout", "bounding boxes"]):
            params.ocr_render_type = "hocr"
        if any(word in text for word in ["spanish", "español", "espanol"]):
            params.languages = ["spa"]
        return params

    if isinstance(params, tool_models.WatermarkParams):
        if params.watermark_type is None:
            has_text = bool(params.watermark_text)
            has_image = params.watermark_image is not None
            if has_image and not has_text:
                params.watermark_type = "image"
            else:
                params.watermark_type = "text"
        return params

    return params


def format_disambiguation_question() -> str:
    return (
        "I can help with rotate, OCR (make searchable), compress, split, merge, extract, and more. "
        "Which change do you want?"
    )


# Operations that must be last in a chain — either because they produce non-PDF output,
# or because their output (e.g. an encrypted PDF) cannot be processed by subsequent operations.
TERMINAL_OPERATIONS = {
    # Conversion operations (produce various file formats)
    "pdfToCsv",  # Produces CSV
    "pdfToExcel",  # Produces Excel
    "pdfToHtml",  # Produces HTML
    "pdfToXml",  # Produces XML
    "pdfToText",  # Produces plain text
    "processPdfToRTForTXT",  # Produces RTF/TXT
    "convertPdfToCbr",  # Produces CBR
    "convertPdfToCbz",  # Produces CBZ
    # Analysis operations (produce JSON/Boolean responses)
    "containsImage",  # Returns Boolean
    "containsText",  # Returns Boolean
    "getPdfInfo",  # Returns JSON
    "getBasicInfo",  # Returns JSON
    "getDocumentProperties",  # Returns JSON
    "getAnnotationInfo",  # Returns JSON
    "getFontInfo",  # Returns JSON
    "getFormFields",  # Returns JSON
    "getPageCount",  # Returns JSON
    "getPageDimensions",  # Returns JSON
    "getSecurityInfo",  # Returns JSON
    "pageCount",  # Returns JSON
    "pageRotation",  # Returns JSON
    "pageSize",  # Returns JSON
    "fileSize",  # Returns JSON
    "validateSignature",  # Returns JSON
    # Security — produces encrypted PDF that cannot be processed by subsequent operations
    "addPassword",
}


@dataclass(frozen=True)
class ValidationResult:
    """Result of operation chain validation."""

    is_valid: bool
    error_message: str | None = None
    error_data: IncompatibleChainError | None = None


def validate_operation_chain(operations: list[tool_models.OperationId]) -> ValidationResult:
    """
    Validate that operation chain is compatible (output of N can be input to N+1).

    Returns:
        ValidationResult with is_valid, error_message, and error_data.
        error_data contains structured info for frontend formatting with translated names.
    """
    if len(operations) <= 1:
        return ValidationResult(is_valid=True)

    for i, operation_id in enumerate(operations[:-1]):  # Check all except last
        if operation_id in TERMINAL_OPERATIONS:
            next_op_id = operations[i + 1]
            # Return structured data for frontend to format with translated names
            # Include path/method so frontend can use getToolFromToolCall() for lookup
            error_data = IncompatibleChainError(
                type="incompatible_chain",
                current_operation=OperationRef(
                    operation_id=operation_id,
                ),
                next_operation=OperationRef(
                    operation_id=next_op_id,
                ),
            )
            # Fallback message using summaries (in case frontend doesn't handle it)
            current_name = operation_id
            next_name = next_op_id
            error_message = (
                f"Cannot chain '{current_name}' with '{next_name}'. "
                f"'{current_name}' must be the last operation in a chain. "
                f"Please run '{current_name}' as the final operation, or remove it from the chain."
            )
            return ValidationResult(
                is_valid=False,
                error_message=error_message,
                error_data=error_data,
            )

    return ValidationResult(is_valid=True)


def build_plan_summary(ops: list[tool_models.OperationId]) -> str:
    if not ops:
        return "I will run the requested tools."
    if len(ops) == 1:
        return f"I will run {ops[0]}."
    return "I will run " + ", then ".join(ops) + "."


def get_pdf_preflight(file_path: str) -> PdfPreflight:
    file_size = os.path.getsize(file_path)

    reader = PdfReader(file_path)

    is_encrypted = bool(reader.is_encrypted)
    if reader.is_encrypted:
        reader.decrypt("")
    page_count = len(reader.pages)
    text_found = False
    for page in reader.pages[:2]:
        extracted = page.extract_text()
        if len(extracted.strip()) > 20:
            text_found = True
            break
    return PdfPreflight(
        file_size_mb=round(file_size / (1024 * 1024), 2),
        is_encrypted=is_encrypted,
        page_count=page_count,
        has_text_layer=text_found,
    )


def create_session_file(
    file_path: str,
    file_name: str,
    content_type: str | None,
    content_disposition: str | None = None,
) -> EditSessionFile:
    """
    Create an EditSessionFile with proper type detection and preflight handling.

    Only runs PDF preflight for actual PDF files. For non-PDF files, uses empty preflight dict.

    Args:
        file_path: Path to the file on disk
        file_name: Default filename to use if not in content_disposition
        content_type: MIME type from response (None defaults to application/octet-stream)
        content_disposition: Content-Disposition header for filename extraction

    Returns:
        EditSessionFile with proper file_type and preflight data
    """
    # Normalize content type (avoid defaulting to PDF)
    normalized_content_type = content_type or "application/octet-stream"
    file_type = normalized_content_type.split(";")[0].strip()

    # Extract filename from content_disposition if available
    derived_name = file_name
    if content_disposition and "filename=" in content_disposition:
        derived_name = content_disposition.split("filename=")[-1].strip('"')

    # Only get PDF preflight for actual PDF files
    preflight = get_pdf_preflight(file_path) if file_type == "application/pdf" else PdfPreflight()

    return EditSessionFile(
        file_id=uuid.uuid4().hex,
        file_path=file_path,
        file_name=derived_name,
        file_type=file_type,
        preflight=preflight,
    )


def build_pdf_text_context(
    file_path: str,
    *,
    max_pages: int = 12,
    max_chars_per_page: int = 600,
    max_total_chars: int = 4000,
) -> dict[str, Any]:
    doc = convert_pdf_to_text_editor_document(file_path)
    pages = doc.document.pages if doc else []
    context_pages: list[dict[str, Any]] = []
    total_chars = 0
    for index, page in enumerate(pages[:max_pages]):
        text_chunks = []
        for elem in page.text_elements:
            if elem.text:
                text_chunks.append(str(elem.text))
        combined = " ".join(text_chunks)
        combined = " ".join(combined.split())
        if not combined:
            continue
        snippet = combined[:max_chars_per_page]
        total_chars += len(snippet)
        if total_chars > max_total_chars:
            break
        context_pages.append({"page": index + 1, "text": snippet})

    return {
        "type": "file_context",
        "page_count": len(pages),
        "pages": context_pages,
    }


def answer_pdf_question(file_path: str, question: str) -> str:
    doc = convert_pdf_to_text_editor_document(file_path)
    pages = doc.document.pages if doc else []
    snippets: list[str] = []
    for page in pages:
        for elem in page.text_elements:
            text = elem.text
            if text:
                snippets.append(str(text))
    if not snippets:
        raise RuntimeError("No readable text found in PDF.")

    context = " ".join(snippets)
    context = " ".join(context.split())
    max_context = 10000
    if len(context) > max_context:
        context = context[:max_context]

    system_prompt = pdf_qa_system_prompt() + "\nReturn JSON matching the provided schema."
    user_prompt = f"Question: {question}\n\nPDF text:\n{context}"
    messages = [
        ChatMessage(role="system", content=system_prompt),
        ChatMessage(role="user", content=user_prompt),
    ]
    response = run_ai(
        SMART_MODEL,
        messages,
        PdfAnswer,
        tag="edit_pdf_answer",
        max_tokens=500,
    )
    answer = response.answer.strip()
    normalized_answer = re.sub(r"\s+", " ", answer).strip().lower()
    normalized_context = re.sub(r"\s+", " ", context).strip().lower()
    copied_context = bool(normalized_answer) and normalized_answer in normalized_context
    if copied_context:
        raise RuntimeError("AI answer echoed the source text.")
    return answer


def apply_smart_defaults(
    message: str,
    parameters: tool_models.ParamToolModel,
) -> tool_models.ParamToolModel:
    return infer_smart_defaults(message, parameters)
