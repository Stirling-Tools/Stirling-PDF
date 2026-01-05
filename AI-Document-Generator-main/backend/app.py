import os
import mimetypes
import subprocess
import uuid
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
import re
import time
import threading
import queue
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from flask import Flask, jsonify, request, send_file, Response, stream_with_context
from flask_cors import CORS
import json

from ai_generation import (
    generate_latex_with_llm,
    generate_latex_with_llm_stream,
    generate_outline_with_llm,
    generate_section_draft,
    generate_field_values,
    generate_template_fill_stream,
)
from briefs import gather_brief, _preprocess_intent
from config import (
    CLIENT_MODE,
    SMART_MODEL,
    OUTPUT_DIR,
    ASSETS_DIR,
    TEMPLATE_DIR,
    JAVA_BACKEND_URL,
    PREVIEW_MAX_INFLIGHT,
    get_chat_model,
    logger,
)
from langchain_utils import to_lc_messages
from document_types import detect_document_type
from latex_utils import apply_style_overrides, clean_generated_latex
from pdf_utils import compile_latex_to_pdf, render_pdf_to_images
from pdf_text_editor import convert_pdf_to_text_editor_document
from storage import (
    load_user_style,
    load_user_templates,
    load_versions,
    save_user_style,
    save_user_template,
    save_version,
)
from styles import update_style_profile_from_prompt
from vision import vision_layout_from_images
from prompts import pdf_qa_system_prompt


app = Flask(__name__)
CORS(app)


@app.before_request
def log_job_request_sequence() -> None:
    job_id = request.headers.get("X-Job-Id")
    if not job_id:
        return
    seq = request.headers.get("X-Job-Seq", "?")
    total = request.headers.get("X-Job-Total", "?")
    logger.info("[HTTP] job_id=%s req=%s/%s %s %s", job_id, seq, total, request.method, request.path)


def _json_body() -> Dict[str, Any]:
    return request.get_json(silent=True) or {}

def _require_ai_enabled() -> Optional[Any]:
    if CLIENT_MODE != "langchain":
        return jsonify({"error": "AI is disabled. Set OPENAI_API_KEY to enable AI features."}), 503
    return None


def _java_url(path: str) -> str:
    base = JAVA_BACKEND_URL.rstrip("/")
    if not path.startswith("/"):
        path = "/" + path
    return f"{base}{path}"


def _java_request_json(method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    url = _java_url(path)
    data = None
    headers = {"Content-Type": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8") if exc.fp else ""
        logger.error("[JAVA] %s %s failed status=%s detail=%s", method, path, exc.code, detail)
        raise


def _fetch_ai_session(session_id: str) -> Dict[str, Any]:
    return _java_request_json("GET", f"/api/v1/ai/create/internal/sessions/{session_id}")


def _update_ai_session(session_id: str, payload: Dict[str, Any]) -> None:
    _java_request_json("POST", f"/api/v1/ai/create/internal/sessions/{session_id}/update", payload)


def _sanitize_doc_type(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_]+", "", (value or "").lower())
    return cleaned or "miscellaneous"


def _select_template(doc_type: str, template_id: Optional[str]) -> Optional[str]:
    safe_doc_type = _sanitize_doc_type(doc_type)
    base_dir = Path(TEMPLATE_DIR) / safe_doc_type
    if not base_dir.exists() or not base_dir.is_dir():
        return None

    if template_id:
        safe_template = re.sub(r"[^a-zA-Z0-9_-]+", "", template_id)
        if safe_template:
            candidate = base_dir / f"{safe_template}.tex"
            if candidate.exists():
                return candidate.read_text(encoding="utf-8", errors="replace")

    default_path = base_dir / "default.tex"
    if default_path.exists():
        return default_path.read_text(encoding="utf-8", errors="replace")

    for tex_file in sorted(base_dir.glob("*.tex")):
        return tex_file.read_text(encoding="utf-8", errors="replace")
    return None


@app.route("/api/intent/check", methods=["POST"])
def intent_check() -> Any:
    try:
        data = _json_body()
        prompt: str = data.get("prompt", "")
        history: List[Dict[str, str]] = data.get("conversationHistory") or []
        current_latex: Optional[str] = data.get("currentLatex")
        current_pdf_url: Optional[str] = data.get("currentPdfUrl")
        doc_type = detect_document_type(prompt, current_latex)
        intent = _preprocess_intent(prompt, history, bool(current_pdf_url), current_latex)
        intent["documentType"] = doc_type
        intent["hasPdf"] = bool(current_pdf_url)
        return jsonify(intent)
    except Exception as exc:  # noqa: BLE001
        logger.error("[INTENT] intent_check failed: %s", exc, exc_info=True)
        return jsonify({"wants_pdf": True, "has_enough_info": True, "allow_makeup": False, "reason": str(exc)}), 500


@app.route("/api/pdf/answer", methods=["POST"])
def pdf_answer() -> Any:
    data = _json_body()
    pdf_url = data.get("pdfUrl")
    question = data.get("question")
    if not pdf_url or not question:
        return jsonify({"error": "Missing pdfUrl or question"}), 400

    filename = os.path.basename(pdf_url.split("?")[0])
    if not filename.lower().endswith(".pdf"):
        return jsonify({"error": "Invalid pdf file"}), 400

    pdf_path = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(pdf_path):
        return jsonify({"error": "PDF not found"}), 404

    try:
        doc = convert_pdf_to_text_editor_document(pdf_path)
    except Exception as exc:  # noqa: BLE001
        logger.error("[PDF-ANSWER] failed to parse pdf: %s", exc, exc_info=True)
        return jsonify({"error": "Failed to read PDF content"}), 500

    pages = doc.get("document", {}).get("pages", []) if doc else []
    snippets: List[str] = []
    for page in pages:
        for elem in page.get("textElements", []) or []:
            text = elem.get("text")
            if text:
                snippets.append(str(text))
    if not snippets:
        return jsonify({"error": "No readable text in PDF"}), 400

    # Normalize and limit context
    context = " ".join(snippets)
    context = " ".join(context.split())  # normalize whitespace
    max_context = 10000
    if len(context) > max_context:
        context = context[:max_context]

    # Heuristic helpers
    def _sentences(text: str) -> List[str]:
        return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]

    def _heuristic_summary(text: str, limit: int = 480) -> str:
        sentences = _sentences(text)
        hits = [s for s in sentences if re.search(r"\b(difficult|challenge|problem|issue|hard)\b", s, re.IGNORECASE)]
        chosen = hits[:3] if hits else sentences[:3]
        summary = " ".join(chosen).strip()
        return summary[:limit] + ("…" if len(summary) > limit else "")

    def _heuristic_first_difficulty(text: str) -> str:
        sentences = _sentences(text)
        for s in sentences:
            if re.search(r"\b(difficult|challenge|problem|issue|hard)\b", s, re.IGNORECASE):
                return s
        return sentences[0] if sentences else "No difficulty found in PDF text."

    if CLIENT_MODE != "langchain":
        return jsonify({"error": "PDF Q&A unavailable (no AI client configured)."}), 503

    model_name = SMART_MODEL
    system_prompt = pdf_qa_system_prompt()
    user_prompt = f"Question: {question}\n\nPDF text:\n{context}"
    try:
        llm = get_chat_model(model_name, max_tokens=220)
        if not llm:
            return jsonify({"error": "PDF Q&A unavailable (no AI client configured)."}), 503
        start = time.perf_counter()
        response = llm.invoke(
            to_lc_messages(
                [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ]
            )
        )
        elapsed = time.perf_counter() - start
        content = response.content or ""
        usage = getattr(response, "usage_metadata", None)
        logger.info(
            "[PDF-ANSWER] model=%s elapsed=%.2fs chars=%s usage=%s",
            model_name,
            elapsed,
            len(str(content)),
            usage,
        )
        answer = response.content
        if not answer or not str(answer).strip():
            answer = _heuristic_summary(context)
        # If model parrots title/metadata, replace with heuristic
        title_like = re.match(r"^why pdfs|^minimalist|^author:", answer.strip(), re.IGNORECASE) if answer else None
        normalized_answer = re.sub(r"\s+", " ", answer or "").strip().lower()
        normalized_context = re.sub(r"\s+", " ", context).strip().lower()
        copied_context = bool(normalized_answer) and normalized_answer in normalized_context
        if title_like or copied_context:
            answer = _heuristic_summary(context)
        return jsonify({"answer": answer, "mode": "model"})
    except Exception as exc:  # noqa: BLE001
        logger.error("[PDF-ANSWER] model failed: %s", exc, exc_info=True)
        answer = _heuristic_first_difficulty(context)
        return jsonify({"answer": answer, "mode": "heuristic"})


@app.route("/api/generate", methods=["POST"])
def generate() -> Any:
    """Generate LaTeX + PDF in a single call."""
    data = _json_body()
    user_id = data.get("userId", "default_user")
    prompt: str = data.get("prompt", "")
    history: List[Dict[str, str]] = data.get("conversationHistory") or []
    current_latex: str | None = data.get("currentLatex")
    skip_template = bool(data.get("skipTemplate"))
    force_new_document: Optional[bool] = data.get("forceNewDocument")
    edit_mode = bool(current_latex) and not bool(force_new_document)
    latex_source = current_latex if edit_mode else None

    style_profile = update_style_profile_from_prompt(user_id, prompt)

    doc_type = detect_document_type(prompt, latex_source or current_latex)
    brief = gather_brief(doc_type, prompt, history)
    if brief.get("needsInfo"):
        logger.info("[REQ] brief incomplete doc_type=%s missing=%s", doc_type, brief.get("missing"))
        return jsonify(
            {
                "needsInfo": True,
                "message": brief.get("message"),
                "missing": brief.get("missing", []),
                "collected": brief.get("collected", {}),
                "documentType": doc_type,
            }
        )

    templates = load_user_templates(user_id)
    template_hint = None if (skip_template or edit_mode) else templates.get(doc_type)

    logger.info(
        "[REQ] user=%s doc_type=%s template=%s history_len=%s current_latex=%s skip_template=%s edit_mode=%s",
        user_id,
        doc_type,
        "yes" if template_hint else "no",
        len(history),
        bool(current_latex),
        skip_template,
        edit_mode,
    )

    mode = "live" if CLIENT_MODE == "langchain" else "mock"
    latex_code_raw = generate_latex_with_llm(
        prompt,
        history,
        style_profile,
        doc_type,
        template_hint,
        latex_source,
        brief.get("structured_brief"),
        edit_mode=edit_mode,
    )
    latex_code = apply_style_overrides(clean_generated_latex(latex_code_raw), style_profile)

    doc_type = detect_document_type(prompt, latex_code)
    save_user_style(user_id, {"last_doc_type": doc_type})
    if not skip_template and not edit_mode:
        save_user_template(user_id, doc_type, latex_code)
    elif skip_template:
        logger.info("[TEMPLATE] skip flag set; not persisting template for %s", doc_type)
    else:
        logger.info("[TEMPLATE] edit mode active; not updating template for %s", doc_type)
    template_used = bool(template_hint)

    job_id = str(uuid.uuid4())
    pdf_path = compile_latex_to_pdf(latex_code, job_id)
    if pdf_path and os.path.exists(pdf_path):
        pdf_url = f"/output/{job_id}.pdf"
        version_entry = {
            "id": job_id,
            "prompt": prompt,
            "documentType": doc_type,
            "pdfUrl": pdf_url,
            "latex": latex_code,
            "createdAt": datetime.utcnow().isoformat() + "Z",
            "styleProfile": style_profile,
            "templateUsed": template_used,
            "editMode": edit_mode,
        }
        save_version(user_id, version_entry)

        logger.info("[OK] job_id=%s doc_type=%s pdf_url=%s", job_id, doc_type, pdf_url)
        return jsonify(
            {
                "latex": latex_code,
                "pdfUrl": pdf_url,
                "documentType": doc_type,
                "message": f"Generated {doc_type} successfully! mode={mode}",
                "version": version_entry,
                "styleProfile": style_profile,
                "mode": mode,
                "templateUsed": template_used,
                "editingExisting": edit_mode,
            }
        )

    logger.error("[FAIL] job_id=%s doc_type=%s compile_failed", job_id, doc_type)
    return jsonify(
        {
            "error": "LaTeX compilation failed. Check logs.",
            "latex": latex_code,
            "mode": mode,
            "editingExisting": edit_mode,
        }
    ), 500


@app.route("/api/generate_stream", methods=["POST"])
def generate_stream() -> Any:
    """Stream LaTeX generation and compile PDFs incrementally."""
    try:
        data = _json_body()
        user_id = data.get("userId", "default_user")
        prompt: str = data.get("prompt", "")
        history: List[Dict[str, str]] = data.get("conversationHistory") or []
        current_latex: str | None = data.get("currentLatex")
        skip_template = bool(data.get("skipTemplate"))
        force_new_document: Optional[bool] = data.get("forceNewDocument")
        edit_mode = bool(current_latex) and not bool(force_new_document)
        latex_source = current_latex if edit_mode else None
        style_profile = update_style_profile_from_prompt(user_id, prompt)
        doc_type = detect_document_type(prompt, latex_source or current_latex)
        brief = gather_brief(doc_type, prompt, history, current_latex, bool(current_latex))
        logger.info(
            "[STREAM] brief gate doc_type=%s needsInfo=%s missing=%s allowFabrication=%s",
            doc_type,
            brief.get("needsInfo"),
            brief.get("missing"),
            brief.get("allowFabrication"),
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("[STREAM] Failed to prepare generation request: %s", exc, exc_info=True)
        return jsonify({"error": "Failed to start generation", "detail": str(exc)}), 500
    
    if brief.get("needsInfo"):
        # Return a normal 200 with guidance so the assistant can ask follow-up questions
        return jsonify(
            {
                "needsInfo": True,
                "message": brief.get("message"),
                "missing": brief.get("missing", []),
                "collected": brief.get("collected", {}),
                "documentType": doc_type,
                "allowFabrication": brief.get("allowFabrication", False),
            }
        )

    templates = load_user_templates(user_id)
    template_hint = None if (skip_template or edit_mode) else templates.get(doc_type)

    job_id = str(uuid.uuid4())
    accumulated_latex = ""
    last_compile_idx = 0
    compile_interval = 250  # Compile every ~250 characters for faster previews
    compile_time_budget = 2.0  # Or every ~2 seconds, whichever comes first
    last_compile_time = time.perf_counter()
    last_heartbeat_time = time.perf_counter()
    stream_start = time.perf_counter()
    first_chunk_time: Optional[float] = None
    last_chunk_time: Optional[float] = None
    total_chunk_chars = 0
    total_chunks = 0

    preview_executor = ThreadPoolExecutor(max_workers=2)
    preview_tasks: Dict[str, Tuple[Any, int]] = {}
    chunk_queue: "queue.Queue[Tuple[str, Optional[str]]]" = queue.Queue()

    def stream_latex():
        try:
            for chunk in generate_latex_with_llm_stream(
                prompt,
                history,
                style_profile,
                doc_type,
                template_hint,
                latex_source,
                brief.get("structured_brief"),
                edit_mode=edit_mode,
            ):
                chunk_queue.put(("chunk", chunk))
        except Exception as exc:
            logger.error("[STREAM] LLM streaming failed: %s", exc, exc_info=True)
            chunk_queue.put(("error", str(exc)))
        finally:
            chunk_queue.put(("done", None))

    def submit_preview(latex: str, progress: int) -> None:
        if len(preview_tasks) >= PREVIEW_MAX_INFLIGHT:
            return
        preview_job_id = f"{job_id}-preview-{progress}"

        def _run_compile() -> Optional[str]:
            return compile_latex_to_pdf(latex, preview_job_id, log_errors=False)

        fut = preview_executor.submit(_run_compile)
        preview_tasks[preview_job_id] = (fut, progress)

    def drain_previews():
        nonlocal last_compile_idx, last_compile_time
        completed = []
        for pid, (fut, progress) in list(preview_tasks.items()):
            if fut.done():
                completed.append(pid)
                try:
                    pdf_path = fut.result()
                    if pdf_path and os.path.exists(pdf_path):
                        pdf_url = f"/output/{pid}.pdf"
                        yield f"data: {json.dumps({'type': 'pdf_update', 'pdfUrl': pdf_url, 'progress': progress})}\n\n"
                        last_compile_idx = progress
                        last_compile_time = time.perf_counter()
                except Exception as e:  # noqa: BLE001
                    logger.error("[STREAM] Preview compile failed (async): %s", e, exc_info=True)
        for pid in completed:
            preview_tasks.pop(pid, None)

    def generate():
        nonlocal accumulated_latex, last_compile_time, last_heartbeat_time
        nonlocal total_chunk_chars, total_chunks, first_chunk_time, last_chunk_time

        # Send initial metadata
        yield f"data: {json.dumps({'type': 'start', 'jobId': job_id, 'documentType': doc_type, 'editingExisting': edit_mode})}\n\n"

        streamer = threading.Thread(target=stream_latex, daemon=True)
        streamer.start()

        try:
            while True:
                try:
                    item_type, payload = chunk_queue.get(timeout=0.5)
                except queue.Empty:
                    now = time.perf_counter()
                    if now - last_heartbeat_time >= 1.0:
                        yield f"data: {json.dumps({'type': 'heartbeat', 'ts': now})}\n\n"
                        last_heartbeat_time = now
                    yield from drain_previews()
                    continue

                if item_type == "chunk":
                    chunk = payload or ""
                    accumulated_latex += chunk
                    total_chunks += 1
                    total_chunk_chars += len(chunk)
                    last_chunk_time = time.perf_counter()
                    if first_chunk_time is None:
                        first_chunk_time = last_chunk_time
                    yield f"data: {json.dumps({'type': 'latex_chunk', 'chunk': chunk, 'accumulated': accumulated_latex})}\n\n"

                    elapsed = time.perf_counter() - last_compile_time
                    if (len(accumulated_latex) - last_compile_idx >= compile_interval) or elapsed >= compile_time_budget:
                        compile_latex = accumulated_latex
                        if "\\begin{document}" in compile_latex and "\\end{document}" not in compile_latex:
                            if compile_latex.count("\\begin{") > compile_latex.count("\\end{"):
                                temp_latex = compile_latex
                                last_begin = compile_latex.rfind("\\begin{")
                                if last_begin != -1:
                                    env_start = last_begin + len("\\begin{")
                                    env_end = compile_latex.find("}", env_start)
                                    if env_end != -1:
                                        env_name = compile_latex[env_start:env_end]
                                        temp_latex += f"\\end{{{env_name}}}\n"
                                temp_latex += "\\end{document}\n"
                                compile_latex = temp_latex
                            else:
                                compile_latex += "\\end{document}\n"

                        if "\\begin{document}" in compile_latex and "\\end{document}" in compile_latex:
                            submit_preview(compile_latex, len(accumulated_latex))

                    now = time.perf_counter()
                    if now - last_heartbeat_time >= 1.0:
                        yield f"data: {json.dumps({'type': 'heartbeat', 'ts': now})}\n\n"
                        last_heartbeat_time = now
                    yield from drain_previews()

                elif item_type == "error":
                    message = payload or "Streaming failed"
                    yield f"data: {json.dumps({'type': 'error', 'message': message})}\n\n"
                    break
                elif item_type == "done":
                    break

            stream_end = time.perf_counter()
            if first_chunk_time is None:
                logger.info(
                    "[STREAM] LLM finished with no chunks job_id=%s elapsed=%.2fs",
                    job_id,
                    stream_end - stream_start,
                )
            else:
                logger.info(
                    "[STREAM] LLM stats job_id=%s chunks=%s chars=%s first_chunk=%.2fs last_chunk=%.2fs elapsed=%.2fs",
                    job_id,
                    total_chunks,
                    total_chunk_chars,
                    first_chunk_time - stream_start,
                    (last_chunk_time or stream_end) - stream_start,
                    stream_end - stream_start,
                )

            # Final compilation with complete LaTeX
            latex_code = apply_style_overrides(clean_generated_latex(accumulated_latex), style_profile)
            final_doc_type = detect_document_type(prompt, latex_code)
            save_user_style(user_id, {"last_doc_type": final_doc_type})
            if not skip_template and not edit_mode:
                save_user_template(user_id, final_doc_type, latex_code)
            elif skip_template:
                logger.info("[TEMPLATE] skip flag set; not persisting template for %s", final_doc_type)
            else:
                logger.info("[TEMPLATE] edit mode active; not updating template for %s", final_doc_type)
            template_used = bool(template_hint)

            pdf_path = compile_latex_to_pdf(latex_code, job_id)
            if pdf_path and os.path.exists(pdf_path):
                pdf_url = f"/output/{job_id}.pdf"
                version_entry = {
                    "id": job_id,
                    "prompt": prompt,
                    "documentType": final_doc_type,
                    "pdfUrl": pdf_url,
                    "latex": latex_code,
                    "createdAt": datetime.utcnow().isoformat() + "Z",
                    "styleProfile": style_profile,
                    "templateUsed": template_used,
                    "editMode": edit_mode,
                }
                save_version(user_id, version_entry)

                yield f"data: {json.dumps({'type': 'complete', 'pdfUrl': pdf_url, 'latex': latex_code, 'version': version_entry, 'documentType': final_doc_type, 'templateUsed': template_used, 'styleProfile': style_profile, 'editingExisting': edit_mode})}\n\n"
            else:
                logger.error("[STREAM] Final PDF compilation failed for job_id=%s", job_id)
                yield f"data: {json.dumps({'type': 'error', 'message': 'Final PDF compilation failed'})}\n\n"

        except Exception as e:  # noqa: BLE001
            logger.error("[STREAM] Generation error job_id=%s: %s", job_id, e, exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        finally:
            try:
                preview_executor.shutdown(wait=False, cancel_futures=True)
            except Exception:
                pass

    try:
        return Response(
            stream_with_context(generate()),
            mimetype="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("[STREAM] Failed to start response: %s", exc, exc_info=True)
        return jsonify({"error": "Unable to start streaming response", "detail": str(exc)}), 500


@app.route("/api/create/sessions/<session_id>/stream", methods=["GET"])
def create_stream(session_id: str) -> Any:
    disabled = _require_ai_enabled()
    if disabled:
        return disabled
    phase = (request.args.get("phase") or "outline").strip().lower()
    try:
        session = _fetch_ai_session(session_id)
    except Exception:  # noqa: BLE001
        return jsonify({"error": "Session not found"}), 404

    user_id = session.get("userId", "default_user")
    prompt = session.get("promptLatest") or session.get("promptInitial") or ""
    doc_type = session.get("docType") or detect_document_type(prompt, None)
    template_id = session.get("templateId")
    outline_text = session.get("outlineText") or ""
    constraints = session.get("outlineConstraints")
    if isinstance(constraints, str) and constraints.strip():
        try:
            constraints = json.loads(constraints)
        except json.JSONDecodeError:
            constraints = None
    draft_sections_raw = session.get("draftSections")
    draft_sections = None
    if isinstance(draft_sections_raw, list):
        draft_sections = draft_sections_raw
    elif isinstance(draft_sections_raw, str) and draft_sections_raw.strip():
        try:
            draft_sections = json.loads(draft_sections_raw)
        except json.JSONDecodeError:
            draft_sections = None
    style_profile = load_user_style(user_id)

    def sse(data: Dict[str, Any]) -> str:
        return f"data: {json.dumps(data)}\n\n"

    def generate():
        yield sse({"type": "phase_changed", "phase": phase})

        if phase == "outline":
            outline = generate_outline_with_llm(prompt, doc_type, constraints)
            _update_ai_session(
                session_id,
                {
                    "outlineText": outline,
                    "outlineConstraints": json.dumps(constraints, ensure_ascii=True) if constraints else None,
                    "docType": doc_type,
                    "status": "OUTLINE_PENDING",
                },
            )
            yield sse({"type": "outline_ready", "outlineText": outline})
            yield sse({"type": "phase_complete", "phase": "outline"})
            return

        if phase == "draft":
            base_outline = outline_text or prompt
            sections = generate_section_draft(prompt, doc_type, base_outline, constraints)
            _update_ai_session(
                session_id,
                {
                    "draftSections": json.dumps(sections, ensure_ascii=True),
                    "outlineConstraints": json.dumps(constraints, ensure_ascii=True) if constraints else None,
                    "docType": doc_type,
                    "status": "DRAFT_READY",
                },
            )
            yield sse({"type": "draft_sections", "sections": sections})
            yield sse({"type": "phase_complete", "phase": "draft", "sections": sections})
            return

        if phase == "polish":
            accumulated = ""
            template_latex = _select_template(doc_type, template_id)
            if template_latex:
                for chunk in generate_template_fill_stream(
                    template_latex,
                    doc_type,
                    outline_text or prompt,
                    draft_sections=draft_sections,
                    constraints=constraints,
                    style_profile=style_profile,
                ):
                    accumulated += chunk
                    yield sse({"type": "latex_delta", "phase": "polish", "delta": chunk})
            else:
                section_text = ""
                if draft_sections:
                    section_text = "\n".join(
                        f"{section.get('label', 'Section')}: {section.get('value', '')}"
                        for section in draft_sections
                    )
                constraint_text = ""
                if constraints:
                    tone = constraints.get("tone")
                    audience = constraints.get("audience")
                    pages = constraints.get("pageCount")
                    constraint_text = f"Tone: {tone}. Audience: {audience}. Target pages: {pages}."
                polish_prompt = (
                    f"Create a polished LaTeX document for a {doc_type}.\n"
                    "Use the provided section content and keep the substance consistent.\n"
                    f"{constraint_text}\n"
                    "Keep the final document within the target page count.\n"
                )
                for chunk in generate_latex_with_llm_stream(
                    polish_prompt,
                    [],
                    style_profile,
                    doc_type,
                    None,
                    None,
                    section_text or outline_text or prompt,
                    edit_mode=True,
                ):
                    accumulated += chunk
                    yield sse({"type": "latex_delta", "phase": "polish", "delta": chunk})

            accumulated = apply_style_overrides(accumulated, style_profile)
            _update_ai_session(
                session_id,
                {"polishedLatex": accumulated, "docType": doc_type, "status": "POLISHED_READY"},
            )

            pdf_job_id = f"{session_id}-polished"
            pdf_path = compile_latex_to_pdf(accumulated, pdf_job_id, log_errors=False)
            if pdf_path and os.path.exists(pdf_path):
                pdf_url = f"/output/{pdf_job_id}.pdf"
                yield sse({"type": "save_complete", "docId": session_id, "pdfUrl": pdf_url})

            yield sse({"type": "phase_complete", "phase": "polish", "latex": accumulated})
            return

        yield sse({"type": "error", "message": f"Unknown phase: {phase}"})

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.route("/api/create/sessions/<session_id>/fields", methods=["POST"])
def fill_fields(session_id: str) -> Any:
    disabled = _require_ai_enabled()
    if disabled:
        return disabled
    try:
        logger.info("[AI create] fill_fields session_id=%s", session_id)
        session = _fetch_ai_session(session_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("[AI create] fill_fields session lookup failed session_id=%s error=%s", session_id, exc)
        return jsonify({"error": "Session not found"}), 404

    data = _json_body()
    fields = data.get("fields") or []
    extra_prompt = data.get("extraPrompt") or ""
    if not isinstance(fields, list):
        return jsonify({"error": "Fields must be a list"}), 400

    prompt = session.get("promptLatest") or session.get("promptInitial") or ""
    if extra_prompt:
        prompt = f"{prompt}\n{extra_prompt}"
    doc_type = session.get("docType") or detect_document_type(prompt, None)
    constraints = session.get("outlineConstraints")
    if isinstance(constraints, str) and constraints.strip():
        try:
            constraints = json.loads(constraints)
        except json.JSONDecodeError:
            constraints = None

    filled = generate_field_values(prompt, doc_type, fields, constraints)
    return jsonify({"fields": filled})




@app.route("/api/progressive_render", methods=["POST"])
def progressive_render() -> Any:
    """Compile arbitrary LaTeX (partial or masked) for progressive previews."""
    data = _json_body()
    latex = data.get("latex")
    if not latex or not isinstance(latex, str):
        return jsonify({"error": "Missing LaTeX payload"}), 400

    job_id = data.get("jobId") or str(uuid.uuid4())
    pdf_path = compile_latex_to_pdf(latex, job_id)
    if pdf_path and os.path.exists(pdf_path):
        return jsonify({"pdfUrl": f"/output/{job_id}.pdf"})

    return jsonify({"error": "Progressive compilation failed"}), 500


@app.route("/output/<path:filename>", methods=["GET"])
def serve_output_file(filename: str) -> Any:
    """Serve generated PDF files and stored assets."""
    file_path = os.path.join(OUTPUT_DIR, filename)
    if os.path.exists(file_path):
        mime_type, _ = mimetypes.guess_type(file_path)
        return send_file(file_path, mimetype=mime_type or "application/octet-stream")
    return jsonify({"error": "File not found"}), 404


@app.route("/api/versions/<user_id>", methods=["GET"])
def list_versions(user_id: str) -> Any:
    return jsonify({"versions": load_versions(user_id)})


@app.route("/api/style/<user_id>", methods=["GET"])
def get_style(user_id: str) -> Any:
    return jsonify({"style": load_user_style(user_id)})


@app.route("/api/style/<user_id>", methods=["POST"])
def update_style(user_id: str) -> Any:
    data = _json_body()
    if not isinstance(data, dict):
        return jsonify({"error": "Style payload must be an object"}), 400
    current = load_user_style(user_id) or {}
    merged = {**current, **data}
    save_user_style(user_id, merged)
    return jsonify({"style": merged})


@app.route("/api/style/apply", methods=["POST"])
def apply_style() -> Any:
    data = _json_body()
    latex = data.get("latex")
    style = data.get("style") or {}
    if not latex or not isinstance(latex, str):
        return jsonify({"error": "Missing LaTeX payload"}), 400
    if not isinstance(style, dict):
        return jsonify({"error": "Style payload must be an object"}), 400
    updated = apply_style_overrides(latex, style)
    return jsonify({"latex": updated})


@app.route("/api/import_template", methods=["POST"])
def import_template() -> Any:
    """Accept a PDF upload, extract layout via vision model, and save as a template."""
    user_id = request.form.get("userId", "default_user")
    doc_type = request.form.get("docType", "document")
    file = request.files.get("file")

    if not file:
        return jsonify({"error": "No file uploaded"}), 400

    pdf_bytes = file.read()
    images = render_pdf_to_images(pdf_bytes, max_pages=2, dpi=170)
    if not images:
        return jsonify({"error": "Failed to render PDF"}), 400

    layout_latex = vision_layout_from_images(images, doc_type) or ""
    if not layout_latex:
        layout_latex = f"""\\documentclass{{article}}
\\usepackage[margin=1in]{{geometry}}
\\usepackage{{tabularx}}
\\usepackage{{multicol}}
\\begin{{document}}
% Fallback template for {doc_type}
\\section*{{Title placeholder}}
Body text goes here.
\\end{{document}}
"""

    sanitized = clean_generated_latex(layout_latex)
    save_user_template(user_id, doc_type, sanitized)
    return jsonify({"message": "Template imported", "docType": doc_type, "pages": len(images)})


@app.route("/api/assets/upload", methods=["POST"])
def upload_asset() -> Any:
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

    return jsonify(
        {
            "assetId": asset_id,
            "assetUrl": f"/output/assets/{asset_id}",
            "latexPath": f"assets/{asset_id}",
        }
    )


@app.route("/api/pdf-editor/document", methods=["GET"])
def pdf_editor_document() -> Any:
    """Expose a JSON snapshot of the PDF for rich text editing."""
    pdf_url = request.args.get("pdfUrl")
    if not pdf_url:
        return jsonify({"error": "Missing pdfUrl"}), 400

    filename = os.path.basename(pdf_url.split("?")[0])
    if not filename:
        return jsonify({"error": "Invalid pdf file"}), 400
    if not filename.lower().endswith(".pdf"):
        return jsonify({"error": "Invalid pdf file"}), 400

    pdf_path = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(pdf_path):
        return jsonify({"error": "PDF not found"}), 404

    try:
        document = convert_pdf_to_text_editor_document(pdf_path)
        return jsonify(document)
    except FileNotFoundError:
        return jsonify({"error": "Conversion failed"}), 500
    except subprocess.CalledProcessError as exc:
        logger.error("[PDF-EDITOR] Conversion failed: %s", exc)
        return jsonify({"error": "Conversion failed"}), 500
    except Exception as exc:  # noqa: BLE001
        logger.error("[PDF-EDITOR] Unexpected conversion failure: %s", exc)
        return jsonify({"error": "Conversion failed"}), 500


@app.route("/api/pdf-editor/upload", methods=["POST"])
def pdf_editor_upload() -> Any:
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
    return jsonify({"pdfUrl": f"/output/{filename}"})


@app.route("/health", methods=["GET"])
def health() -> Any:
    return jsonify({"status": "ok", "engine": "pdflatex"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
