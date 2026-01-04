from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional
import time

from config import CLIENT_MODE, SMART_MODEL, STREAMING_ENABLED, get_chat_model, logger
from langchain_utils import to_lc_messages
from storage import save_user_style
from prompts import latex_system_prompt, latex_context_messages


def generate_outline_with_llm(
    prompt: str,
    document_type: str,
    constraints: Optional[Dict[str, Any]] = None,
) -> str:
    if CLIENT_MODE == "langchain":
        constraint_text = ""
        if constraints:
            tone = constraints.get("tone")
            audience = constraints.get("audience")
            pages = constraints.get("pageCount")
            constraint_text = f"Tone: {tone}. Audience: {audience}. Target pages: {pages}."
        system_prompt = (
            "You are an outline generator for document creation.\n"
            f"Document type: {document_type}\n"
            f"{constraint_text}\n"
            "Return a concise outline with section titles and short descriptions.\n"
            "Keep each description to roughly 6-12 words.\n"
            "Ensure the outline scope fits the target page count.\n"
            "Output plain text only, using a numbered list with 5-9 sections."
        )
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ]
        try:
            llm = get_chat_model(SMART_MODEL)
            if llm:
                start = time.perf_counter()
                response = llm.invoke(to_lc_messages(messages))
                elapsed = time.perf_counter() - start
                content = response.content or ""
                usage = getattr(response, "usage_metadata", None)
                logger.info(
                    "[AI] outline model=%s elapsed=%.2fs chars=%s usage=%s",
                    SMART_MODEL,
                    elapsed,
                    len(str(content)),
                    usage,
                )
                if content:
                    return str(content).strip()
        except Exception as exc:
            logger.error("[AI] Outline generation failed, falling back: %s", exc)

    safe_prompt = prompt.strip() or "Document"
    return (
        "1) Introduction - Summary of the document goals.\n"
        "2) Background - Context and key assumptions.\n"
        "3) Main Content - Core points and supporting details.\n"
        "4) Evidence - Data, examples, or references.\n"
        "5) Conclusion - Wrap-up and next steps.\n"
        f"Notes: Tailor details to '{safe_prompt}'."
    )


def _parse_outline_to_sections(outline_text: str) -> List[Dict[str, str]]:
    lines = [
        line.strip()
        for line in outline_text.split("\n")
        if line.strip() and not re.match(r"^(section|details)$", line.strip(), re.IGNORECASE)
    ]
    sections: List[Dict[str, str]] = []
    i = 0
    while i < len(lines):
        cleaned = re.sub(r"^\d+[\).\s-]+", "", lines[i]).strip()
        if not cleaned:
            i += 1
            continue

        split = re.split(r"[-–:]+", cleaned, maxsplit=1)
        if len(split) > 1:
            sections.append({"label": split[0].strip() or "Section", "value": split[1].strip()})
            i += 1
            continue

        next_line = lines[i + 1].strip() if i + 1 < len(lines) else ""
        if next_line and not re.match(r"^\d+[\).\s-]+", next_line):
            sections.append({"label": cleaned, "value": next_line})
            i += 2
            continue

        sections.append({"label": cleaned, "value": ""})
        i += 1

    return sections


def _extract_fields_from_prompt(prompt: str, fields: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    lines = [line.strip() for line in prompt.split("\n") if line.strip()]
    kv_pairs: Dict[str, str] = {}
    for line in lines:
        match = re.match(r"^([^:]{2,40}):\s*(.+)$", line)
        if match:
            kv_pairs[match.group(1).strip().lower()] = match.group(2).strip()

    email_match = re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", prompt, re.IGNORECASE)
    phone_match = re.search(r"(\+?\d[\d\s().-]{7,})", prompt)
    date_match = re.search(r"\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b", prompt)
    money_match = re.search(r"\$\s?\d[\d,]*(?:\.\d{2})?", prompt)

    filled: List[Dict[str, str]] = []
    for field in fields:
        label = str(field.get("label", "Field"))
        value = str(field.get("value", "") or "")
        if value.strip():
            filled.append({"label": label, "value": value})
            continue
        label_lower = label.lower()
        for key, val in kv_pairs.items():
            if key in label_lower:
                value = val
                break
        if not value and email_match and "email" in label_lower:
            value = email_match.group(0)
        if not value and phone_match and "phone" in label_lower:
            value = phone_match.group(0)
        if not value and date_match and ("date" in label_lower or "due" in label_lower):
            value = date_match.group(0)
        if not value and money_match and ("total" in label_lower or "amount" in label_lower):
            value = money_match.group(0)
        filled.append({"label": label, "value": value})
    return filled


def generate_field_values(
    prompt: str,
    document_type: str,
    fields: List[Dict[str, Any]],
    constraints: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, str]]:
    if CLIENT_MODE == "langchain":
        constraint_text = ""
        if constraints:
            tone = constraints.get("tone")
            audience = constraints.get("audience")
            pages = constraints.get("pageCount")
            constraint_text = f"Tone: {tone}. Audience: {audience}. Target pages: {pages}."
        system_prompt = (
            "You are extracting field values from a user prompt.\n"
            "Return a JSON array of objects with keys: label, value.\n"
            "Only fill values that are explicitly stated or strongly implied.\n"
            "If unknown, return an empty string.\n"
            f"{constraint_text}\n"
            "Output JSON only."
        )
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Document type: {document_type}"},
            {"role": "user", "content": f"Prompt:\n{prompt}"},
            {"role": "user", "content": f"Fields:\n{json.dumps(fields, ensure_ascii=True)}"},
        ]
        try:
            llm = get_chat_model(SMART_MODEL)
            if llm:
                start = time.perf_counter()
                response = llm.invoke(to_lc_messages(messages))
                elapsed = time.perf_counter() - start
                content = response.content or ""
                usage = getattr(response, "usage_metadata", None)
                logger.info(
                    "[AI] field-extract model=%s elapsed=%.2fs chars=%s usage=%s",
                    SMART_MODEL,
                    elapsed,
                    len(str(content)),
                    usage,
                )
                if content:
                    parsed = _extract_json_array(str(content))
                    if parsed:
                        return [
                            {
                                "label": str(item.get("label", "Field")),
                                "value": str(item.get("value", "")),
                            }
                            for item in parsed
                            if isinstance(item, dict)
                        ]
        except Exception as exc:
            logger.error("[AI] Field extraction failed, falling back: %s", exc)

    return _extract_fields_from_prompt(prompt, fields)

def _extract_json_array(payload: str) -> Optional[List[Dict[str, Any]]]:
    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        match = re.search(r"\[[\s\S]*\]", payload)
        if not match:
            return None
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return None


def generate_section_draft(
    prompt: str,
    document_type: str,
    outline_text: str,
    constraints: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, str]]:
    if CLIENT_MODE == "langchain":
        constraint_text = ""
        if constraints:
            tone = constraints.get("tone")
            audience = constraints.get("audience")
            pages = constraints.get("pageCount")
            constraint_text = f"Tone: {tone}. Audience: {audience}. Target pages: {pages}."
        system_prompt = (
            "You are generating section content for a document.\n"
            "Return a JSON array of objects with keys: label, value.\n"
            "Use the provided outline sections as labels; values should be polished draft text.\n"
            f"{constraint_text}\n"
            "Keep the total length appropriate to the target pages.\n"
            "Output JSON only."
        )
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Document type: {document_type}"},
            {"role": "user", "content": f"Outline:\n{outline_text}"},
            {"role": "user", "content": f"Prompt:\n{prompt}"},
        ]
        try:
            llm = get_chat_model(SMART_MODEL)
            if llm:
                start = time.perf_counter()
                response = llm.invoke(to_lc_messages(messages))
                elapsed = time.perf_counter() - start
                content = response.content or ""
                usage = getattr(response, "usage_metadata", None)
                logger.info(
                    "[AI] section-draft model=%s elapsed=%.2fs chars=%s usage=%s",
                    SMART_MODEL,
                    elapsed,
                    len(str(content)),
                    usage,
                )
                if content:
                    parsed = _extract_json_array(str(content))
                    if parsed:
                        return [
                            {
                                "label": str(item.get("label", "Section")),
                                "value": str(item.get("value", "")),
                            }
                            for item in parsed
                            if isinstance(item, dict)
                        ]
        except Exception as exc:
            logger.error("[AI] Section draft generation failed, falling back: %s", exc)

    if outline_text.strip():
        return _parse_outline_to_sections(outline_text)

    fallback_label = "Main Content"
    return [{"label": fallback_label, "value": prompt.strip() or "Draft content"}]


def _fallback_template_fill(template_latex: str, outline_text: str, draft_text: Optional[str] = None) -> str:
    default_text = draft_text or outline_text or "Details pending."
    replacements = {
        "TITLE": "Project Overview",
        "SUBTITLE": "Executive Summary",
        "AUTHOR": "Jane Doe",
        "AUTHOR_LIST": "Jane Doe, John Smith",
        "AFFILIATIONS": "John Smith Consulting",
        "ABSTRACT": default_text,
        "KEYWORDS": "keyword1, keyword2, keyword3",
        "INTRODUCTION": default_text,
        "RELATED_WORK": default_text,
        "METHODOLOGY": default_text,
        "RESULTS": default_text,
        "DISCUSSION": default_text,
        "CONCLUSION": default_text,
        "REFERENCES": default_text,
        "MAIN_TEXT": default_text,
        "FIGURES_TABLES": default_text,
        "REPORT_TITLE": "Business Report",
        "DATE": "2025-01-01",
        "EXEC_SUMMARY": default_text,
        "BACKGROUND": default_text,
        "FINDINGS": default_text,
        "RECOMMENDATIONS": default_text,
        "APPENDIX": default_text,
        "NEWSLETTER_TITLE": "Doe Consulting Monthly",
        "TOP_STORY": default_text,
        "UPDATES": default_text,
        "SPOTLIGHT": default_text,
        "FOOTER": "Contact: info@example.com",
        "RECIPE_TITLE": "Recipe Title",
        "SERVINGS": "Serves 4",
        "TIME": "30 minutes",
        "INGREDIENTS": "\\\\begin{itemize}\\\\item Ingredient A\\\\item Ingredient B\\\\end{itemize}",
        "INSTRUCTIONS": default_text,
        "NOTES": "Notes and tips.",
        "BUSINESS_NAME": "John Smith Consulting",
        "BUSINESS_ADDRESS": "123 Example Street, Example City",
        "BUSINESS_CONTACT": "billing@example.com | (555) 000-0000",
        "INVOICE_NUMBER": "INV-1001",
        "ISSUE_DATE": "2025-01-01",
        "DUE_DATE": "2025-01-15",
        "CLIENT_NAME": "Doe Corporation",
        "CLIENT_ADDRESS": "456 Sample Avenue, Example City",
        "CLIENT_CONTACT": "ap@example.com",
        "LINE_ITEMS": "Service & 1 & $1000 & $1000 \\\\\\\\",
        "SUBTOTAL": "$1000",
        "TAXES": "$0",
        "TOTAL": "$1000",
        "PAYMENT_TERMS": "Net 15",
        "PAYMENT_METHODS": "Bank transfer, credit card",
        "STUDENT_NAME": "Jane Doe",
        "COURSE_NAME": "Business Communications",
        "INSTRUCTOR_NAME": "Dr. Rivera",
        "ASSIGNMENT_TITLE": "Market Analysis",
        "PROMPT": default_text,
        "RESPONSE": default_text,
        "CHAPTER_ONE_TITLE": "Chapter One",
        "CHAPTER_ONE": default_text,
        "CHAPTER_TWO_TITLE": "Chapter Two",
        "CHAPTER_TWO": default_text,
        "PREFACE": default_text,
        "PUBLISHER": "Doe Press",
        "NAME": "Jane Doe",
        "TITLE_PAGE": "Project Overview",
        "EMAIL": "jane.doe@example.com",
        "PHONE": "(555) 000-0000",
        "LOCATION": "Example City, USA",
        "SUMMARY": default_text,
        "EXPERIENCE": default_text,
        "EDUCATION": default_text,
        "SKILLS": default_text,
        "PROJECTS": default_text,
        "SUBJECT": "Subject",
        "BODY": default_text,
        "RECIPIENT_NAME": "John Smith",
        "RECIPIENT_TITLE": "Hiring Manager",
        "RECIPIENT_COMPANY": "Doe Corporation",
        "RECIPIENT_ADDRESS": "456 Sample Avenue, Example City",
        "SENDER_NAME": "Jane Doe",
        "SENDER_ADDRESS": "123 Example Street, Example City",
        "SENDER_EMAIL": "jane.doe@example.com",
        "MONTH_YEAR": "January 2025",
        "THEME": "Theme",
        "WEEK_ROWS": "1 & 2 & 3 & 4 & 5 & 6 & 7 \\\\\\\\ \\\\hline",
        "HEADLINE": "Launch Announcement",
        "SUBTEXT": "Introducing our latest release.",
        "CALL_TO_ACTION": "Visit example.com to learn more.",
        "CONTACT": "contact@example.com",
        "EXPERIMENT_TITLE": "Experiment",
        "OBJECTIVE": default_text,
        "MATERIALS": default_text,
        "PROCEDURE": default_text,
        "OBSERVATIONS": default_text,
        "INSTITUTION": "Doe Institute",
        "PRESENTER": "Jane Doe",
        "AGENDA": default_text,
        "KEY_POINTS": default_text,
        "DATA_VISUALS": default_text,
    }

    def replace(match: re.Match[str]) -> str:
        key = match.group(1).strip()
        return replacements.get(key, default_text)

    return re.sub(r"<<([A-Z0-9_]+)>>", replace, template_latex)


def generate_template_fill_stream(
    template_latex: str,
    document_type: str,
    outline_text: str,
    draft_sections: Optional[List[Dict[str, str]]] = None,
    constraints: Optional[Dict[str, Any]] = None,
    style_profile: Optional[Dict[str, Any]] = None,
):
    """Fill a LaTeX template by replacing placeholders."""
    if CLIENT_MODE == "langchain":
        constraints_text = ""
        if constraints:
            tone = constraints.get("tone")
            audience = constraints.get("audience")
            pages = constraints.get("pageCount")
            constraints_text = f"Tone: {tone}. Audience: {audience}. Target pages: {pages}."
        style_text = ""
        if style_profile:
            font = style_profile.get("font_preference")
            layout = style_profile.get("layout_preference")
            accent = style_profile.get("color_accent")
            style_text = f"Style preferences: font={font}, layout={layout}, accent={accent}."
        if draft_sections:
            constraints_text = f"{constraints_text}\nUse the section content to inform placeholder values."
        system_prompt = (
            "You are a LaTeX template filler.\n"
            "Return the full LaTeX document with placeholders filled.\n"
            "Rules:\n"
            "1) Only replace placeholders like <<PLACEHOLDER>>.\n"
            "2) Do not change any other LaTeX layout/commands.\n"
            "3) Output ONLY LaTeX (no markdown).\n"
            "4) If you add color, use the accent token name 'accent'.\n"
            f"{constraints_text}\n"
            f"{style_text}\n"
            "Keep the final output within the target page count.\n"
        )
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Document type: {document_type}"},
            {"role": "user", "content": f"Outline/context:\n{outline_text}"},
            {"role": "user", "content": f"Template:\n{template_latex}"},
        ]
        if draft_sections:
            messages.append(
                {
                    "role": "user",
                    "content": f"Section content (JSON):\n{json.dumps(draft_sections, ensure_ascii=True)}",
                }
            )

        try:
            llm = get_chat_model(SMART_MODEL, streaming=True)
            if llm:
                start = time.perf_counter()
                total_chars = 0
                chunk_count = 0
                first_chunk = None
                for chunk in llm.stream(to_lc_messages(messages)):
                    if chunk.content:
                        if first_chunk is None:
                            first_chunk = time.perf_counter()
                        chunk_count += 1
                        total_chars += len(str(chunk.content))
                        yield chunk.content
                elapsed = time.perf_counter() - start
                logger.info(
                    "[AI] template-fill-stream model=%s elapsed=%.2fs first_chunk=%.2fs chunks=%s chars=%s",
                    SMART_MODEL,
                    elapsed,
                    (first_chunk - start) if first_chunk else -1.0,
                    chunk_count,
                    total_chars,
                )
                return
        except Exception as exc:
            logger.error("[AI] Template fill failed, falling back: %s", exc)

    draft_text = None
    if draft_sections:
        draft_text = "\n".join(
            f"{section.get('label', 'Section')}: {section.get('value', '')}"
            for section in draft_sections
        )
    filled = _fallback_template_fill(template_latex, outline_text, draft_text)
    chunk_size = 200
    for i in range(0, len(filled), chunk_size):
        yield filled[i : i + chunk_size]


def generate_latex_with_llm(
    prompt: str,
    history: List[Dict[str, str]],
    style_profile: Dict[str, Any],
    document_type: str,
    template_hint: Optional[str] = None,
    current_latex: Optional[str] = None,
    structured_brief: Optional[str] = None,
    edit_mode: bool = False,
) -> str:
    """Call the LLM (when available) or fall back to deterministic templates."""
    if CLIENT_MODE == "langchain":
        messages: List[Dict[str, Any]] = [{"role": "system", "content": latex_system_prompt(style_profile, document_type, template_hint)}]
        messages.extend(history)
        messages.extend(latex_context_messages(template_hint, current_latex, structured_brief))
        messages.append({"role": "user", "content": prompt})

        try:
            logger.info(
                "[AI] Using live model=%s doc_type=%s template_hint=%s",
                SMART_MODEL,
                document_type,
                "yes" if template_hint else "no",
            )
            llm = get_chat_model(SMART_MODEL)
            if llm:
                start = time.perf_counter()
                response = llm.invoke(to_lc_messages(messages))
                elapsed = time.perf_counter() - start
                content = response.content or ""
                usage = getattr(response, "usage_metadata", None)
                logger.info(
                    "[AI] latex-generate model=%s elapsed=%.2fs chars=%s usage=%s",
                    SMART_MODEL,
                    elapsed,
                    len(str(content)),
                    usage,
                )
                return content
        except Exception as exc:
            logger.error("[AI] LangChain generation failed, falling back to mock: %s", exc)

    lower_prompt = prompt.lower()

    if "invoice" in lower_prompt:
        save_user_style("default_user", {"last_doc_type": "invoice"})
        details = structured_brief or prompt or "Invoice details provided by user."
        return r"""\documentclass{article}
\usepackage[utf8]{inputenc}
\usepackage{geometry}
\geometry{a4paper, margin=1in}

\begin{document}

\begin{center}
    {\LARGE \textbf{INVOICE}}\\[0.5cm]
    \#1023\\
    \today
\end{center}

\section*{Bill To:}
Client Name \\
123 Business Rd.

\section*{Items}
\begin{tabular}{lr}
    \textbf{Service} & \textbf{Amount} \\
    \hline
    % Replace with your line items
    Description & \$0.00 \\
    Description & \$0.00 \\
    \hline
    \textbf{Total Due} & \textbf{\$0.00} \\
\end{tabular}

\section*{Notes}
""" + details + r"""

\end{document}"""

    if "resume" in lower_prompt or "cv" in lower_prompt:
        save_user_style("default_user", {"last_doc_type": "resume"})
        details = structured_brief or prompt or "Resume details provided by user."
        return r"""\documentclass{article}
\usepackage[utf8]{inputenc}
\usepackage{geometry}
\geometry{a4paper, margin=0.75in}

\begin{document}

\section*{Details}
""" + details + r"""

\end{document}"""

    base_doc = r"""\documentclass{article}
\usepackage[utf8]{inputenc}
\usepackage{geometry}
\geometry{a4paper, margin=1in}

\begin{document}

"""
    content = structured_brief or prompt or ""
    base_doc += r"""\section*{Document}

""" + content + r"""

\end{document}"""

    return base_doc


def generate_latex_with_llm_stream(
    prompt: str,
    history: List[Dict[str, str]],
    style_profile: Dict[str, Any],
    document_type: str,
    template_hint: Optional[str] = None,
    current_latex: Optional[str] = None,
    structured_brief: Optional[str] = None,
    edit_mode: bool = False,
):
    """Stream LaTeX generation from LLM, yielding chunks as they arrive."""
    if not STREAMING_ENABLED:
        full_latex = generate_latex_with_llm(
            prompt, history, style_profile, document_type, template_hint, current_latex, structured_brief, edit_mode=edit_mode
        )
        chunk_size = 100
        for i in range(0, len(full_latex), chunk_size):
            yield full_latex[i:i + chunk_size]
        return
    if CLIENT_MODE == "langchain":
        messages: List[Dict[str, Any]] = [{"role": "system", "content": latex_system_prompt(style_profile, document_type, template_hint)}]
        messages.extend(history)
        messages.extend(latex_context_messages(template_hint, current_latex, structured_brief))
        messages.append({"role": "user", "content": prompt})

        try:
            logger.info(
                "[AI] Streaming from model=%s doc_type=%s template_hint=%s",
                SMART_MODEL,
                document_type,
                "yes" if template_hint else "no",
            )
            llm = get_chat_model(SMART_MODEL, streaming=True)
            if llm:
                start = time.perf_counter()
                total_chars = 0
                chunk_count = 0
                first_chunk = None
                for chunk in llm.stream(to_lc_messages(messages)):
                    if chunk.content:
                        if first_chunk is None:
                            first_chunk = time.perf_counter()
                        chunk_count += 1
                        total_chars += len(str(chunk.content))
                        yield chunk.content
                elapsed = time.perf_counter() - start
                logger.info(
                    "[AI] latex-stream model=%s elapsed=%.2fs first_chunk=%.2fs chunks=%s chars=%s",
                    SMART_MODEL,
                    elapsed,
                    (first_chunk - start) if first_chunk else -1.0,
                    chunk_count,
                    total_chars,
                )
                return
        except Exception as exc:
            logger.error("[AI] LangChain streaming failed, falling back to mock: %s", exc)
    
    # Fallback to non-streaming for mock mode
    full_latex = generate_latex_with_llm(
        prompt, history, style_profile, document_type, template_hint, current_latex, structured_brief, edit_mode=edit_mode
    )
    # Simulate streaming by yielding chunks
    chunk_size = 100
    for i in range(0, len(full_latex), chunk_size):
        yield full_latex[i:i + chunk_size]


__all__ = [
    "generate_outline_with_llm",
    "generate_section_draft",
    "generate_field_values",
    "generate_latex_with_llm",
    "generate_latex_with_llm_stream",
    "generate_template_fill_stream",
]
