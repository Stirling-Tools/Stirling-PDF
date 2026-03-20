from __future__ import annotations

import logging
import re
from typing import Any

from config import FAST_MODEL, SMART_MODEL
from llm_utils import run_ai
from models import ChatMessage, IntentCheckResponse, IntentClassification, MissingQuestionsResponse
from prompts import brief_missing_info_system_prompt

logger = logging.getLogger(__name__)

BRIEF_SCHEMAS: dict[str, dict[str, Any]] = {
    "resume": {
        "field_order": [
            "name",
            "contact",
            "location",
            "target_role",
            "summary",
            "work_history",
            "education",
            "skills",
            "achievements",
            "links",
            "constraints",
        ],
        "labels": {
            "name": ["name", "full name"],
            "contact": ["contact", "contact info", "contact information", "email/phone"],
            "location": ["location", "city/country"],
            "target_role": ["target role", "role", "title", "headline"],
            "summary": ["summary", "objective", "about"],
            "work_history": ["experience", "work history", "roles"],
            "education": ["education", "studies"],
            "skills": ["skills", "stack"],
            "achievements": ["achievements", "certifications", "awards"],
            "links": ["links", "profiles", "linkedin/github"],
            "constraints": ["constraints", "tone/length/style"],
        },
        "questions": {
            "name": "What's your name as you'd like it on the page?",
            "contact": "How can someone reach you (email/phone)?",
            "location": "Where are you based (or remote)?",
            "target_role": "What role/title and industry are you aiming for?",
            "summary": "Give me a 1–2 sentence summary about you.",
            "work_history": "Recent roles: company, title, dates, location, and a few bullets with impact.",
            "education": "Degree(s), school, and graduation year?",
            "skills": "Key skills/stack (tech + relevant soft skills)?",
            "achievements": "Awards/certifications/major achievements?",
            "links": "Any LinkedIn/GitHub/portfolio links?",
            "constraints": "Any tone/length constraints (ATS, one-page, etc.)?",
        },
        "intro": "Hey! To build a strong resume, you can paste your old resume or just dump everything you remember—name, how to reach you, where you're based, what you're aiming for, your roles, education, skills, links. Share whatever you have and I'll work with it.",
    },
    "invoice": {
        "field_order": [
            "your_business",
            "client",
            "issue_date",
            "due_date",
            "line_items",
            "currency",
            "payment_terms",
            "notes",
            "constraints",
        ],
        "labels": {
            "your_business": ["your business", "seller", "from"],
            "client": ["client", "bill to"],
            "issue_date": ["issue date", "invoice date"],
            "due_date": ["due date"],
            "line_items": ["line items", "services/items"],
            "currency": ["currency"],
            "payment_terms": ["payment terms"],
            "notes": ["notes"],
            "constraints": ["constraints", "layout/style"],
        },
        "questions": {
            "your_business": "Who is issuing the invoice (business name + contact)?",
            "client": "Who is being billed (name + contact)?",
            "issue_date": "Invoice issue date?",
            "due_date": "Due date?",
            "line_items": "Line items with description, qty, rate, tax (if any)?",
            "currency": "Currency?",
            "payment_terms": "Payment terms and payment methods?",
            "notes": "Notes to include (late fees, thank you, PO #)?",
            "constraints": "Branding/layout preferences?",
        },
        "intro": "I'll draft an accurate invoice if I know who is billing, who is paying, and the line items. Paste an old invoice or list the details.",
    },
}


def classify_intent_with_llm(prompt: str, history: list[ChatMessage], has_pdf: bool) -> IntentClassification:
    """
    Use a small model to classify intent instead of brittle regex.

    Returns a dict like:
    {
      "docType": "invoice|resume|contract|letter|report|form|document",
      "action": "new|edit|question",
      "wantsPdf": bool,
      "hasEnoughInfo": bool,
      "missingFields": [str],
      "notes": str
    }
    """
    system = (
        "You classify user requests about documents. "
        "docType must be one of: academic, agenda, brochure, business_card, case_study, checklist, "
        "contract, creative, datasheet, document, flyer, invoice, letter, manual, menu, minutes, newsletter, "
        "one_pager, poster, presentation, press_release, proposal, recipe, report, resume, timeline, whitepaper. "
        "action: 'new' (make/generate), 'edit' (modify existing), 'question' (asking about it). "
        "wantsPdf: true if they expect/gave permission to generate a PDF. "
        "hasEnoughInfo: true if there is enough info to proceed without fabricating data. "
        "missingFields: key details still needed (e.g., for invoice: seller, client, line items; resume: name, contact, work). "
        "notes: short free-form note. "
        "Return the classification using the provided schema."
    )

    conversation = [ChatMessage(role="system", content=system)]
    # Trim history to keep request small
    trimmed_history = history[-6:] if len(history) > 6 else history
    conversation.extend(trimmed_history)
    conversation.append(ChatMessage(role="user", content=prompt))

    parsed = run_ai(
        FAST_MODEL,
        conversation,
        IntentClassification,
        tag="intent_classify",
        max_tokens=20000,
    )
    result = parsed
    logger.info(
        "[INTENT] llm_classify doc_type=%s action=%s wantsPdf=%s hasEnoughInfo=%s missing=%s notes=%s",
        result.doc_type,
        result.action,
        result.wants_pdf,
        result.has_enough_info,
        result.missing_fields,
        (result.notes or "")[:120],
    )
    return result


def _preprocess_intent(
    prompt: str,
    history: list[ChatMessage],
    has_pdf: bool,
) -> IntentCheckResponse:
    """
    Lightweight intent classifier used by /api/intent/check.

    It is intentionally heuristic-only to avoid extra model calls. The goal is to
    decide whether we should proceed with PDF generation and whether it's OK to
    fabricate placeholder content when the user explicitly asks for it.
    """
    llm = classify_intent_with_llm(prompt, history, has_pdf)
    return IntentCheckResponse(
        wants_pdf=llm.wants_pdf,
        has_enough_info=llm.has_enough_info,
        document_type=llm.doc_type.value,
        missing_fields=llm.missing_fields,
    )


def _extract_structured_fields(text: str, schema: dict[str, Any]) -> dict[str, str]:
    """Naively parse user text to pull schema fields."""
    found: dict[str, str] = {}
    lower = text.lower()

    if schema.get("field_order") == BRIEF_SCHEMAS["resume"]["field_order"]:
        work_matches = re.findall(
            r"(?:experience|work history|role|company|position)\s*[:\-]\s*(.+?)(?=\n\n|\Z)",
            text,
            flags=re.IGNORECASE | re.DOTALL,
        )
        if work_matches:
            found["work_history"] = "\n".join(work_matches[:3])
        education_matches = re.findall(
            r"(?:education|degree)\s*[:\-]\s*(.+?)(?=\n\n|\Z)",
            text,
            flags=re.IGNORECASE | re.DOTALL,
        )
        if education_matches:
            found["education"] = "\n".join(education_matches[:2])
        skills_match = re.search(r"(?:skills|stack)\s*[:\-]\s*(.+)", text, flags=re.IGNORECASE)
        if skills_match:
            found["skills"] = skills_match.group(1).strip()

    for field, labels in schema.get("labels", {}).items():
        for label in labels:
            pattern = rf"{label}\s*[:\-]\s*(.+?)(?=\n[A-Z][a-zA-Z ]+[:\-]|\Z)"
            match = re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL)
            if match:
                found[field] = match.group(1).strip()
                break
    if not found.get("summary") and len(lower) < 200:
        found["summary"] = text.strip()
    return {k: v for k, v in found.items() if v}


def _format_missing_message(
    doc_type: str,
    schema: dict[str, Any],
    collected: dict[str, str],
    missing: list[str],
    preface: str | None = None,
) -> str:
    """Fallback text asking the user for missing fields."""
    intro = schema.get("intro") or f"Need a few details to finish your {doc_type}."
    lines = [intro]
    if preface:
        lines.append(preface)
    if collected:
        lines.append("Already have:")
        for field, value in collected.items():
            label = schema.get("labels", {}).get(field, [field])[0]
            lines.append(f"- {label}: {value}")
    if missing:
        lines.append("Still need:")
        questions = schema.get("questions", {})
        for field in missing[:4]:
            ask = questions.get(field) or f"{field}?"
            lines.append(f"- {ask}")
    lines.append("Partial info is fine—share whatever you remember.")
    return "\n".join(lines)


def _ai_missing_message(
    doc_type: str,
    schema: dict[str, Any],
    collected: dict[str, str],
    missing: list[str],
) -> str | None:
    """Let the model craft clarifying questions when available."""
    if not missing:
        return None

    collected_lines = [
        f"- {schema.get('labels', {}).get(field, [field])[0]}: {value}" for field, value in collected.items()
    ]
    missing_labels = [schema.get("labels", {}).get(field, [field])[0] for field in missing]
    user_text = "We already have:\n" + "\n".join(collected_lines) if collected_lines else "We have nothing yet."
    user_text += "\nNeed to ask for: " + ", ".join(missing_labels)
    if not collected_lines:
        user_text += "\nInvite them to paste an old resume or dump all details if they have them."

    system_prompt = brief_missing_info_system_prompt(doc_type) + "\nReturn JSON that matches the provided schema."
    response = run_ai(
        SMART_MODEL,
        [
            ChatMessage(role="system", content=system_prompt),
            ChatMessage(role="user", content=user_text),
        ],
        MissingQuestionsResponse,
        tag="missing_questions",
        max_tokens=400,
    )
    return response.message


def gather_brief(
    doc_type: str,
    prompt: str,
    history: list[ChatMessage],
    has_pdf: bool = False,
) -> dict[str, Any]:
    """
    Determine whether we have enough structured details to generate.
    Returns needsInfo + a formatted message when details are missing, or a structured brief.
    """
    classifier = classify_intent_with_llm(prompt, history, has_pdf)
    if classifier:
        doc_type = classifier.doc_type.value
        logger.info(
            "[BRIEF] using llm doc_type=%s missing=%s hasEnoughInfo=%s wantsPdf=%s",
            doc_type,
            classifier.missing_fields,
            classifier.has_enough_info,
            classifier.wants_pdf,
        )

    schema = BRIEF_SCHEMAS.get(doc_type)
    if not schema:
        return {"needsInfo": False, "structured_brief": None, "collected": {}, "missing": []}

    user_texts = [entry.content for entry in history if entry.role == "user" and isinstance(entry.content, str)]
    user_texts.append(prompt or "")
    combined_text = "\n".join(user_texts)
    collected = _extract_structured_fields(combined_text, schema)
    missing = [field for field in schema.get("field_order", []) if field not in collected]
    if classifier and classifier.missing_fields:
        # If the model provided missing fields, respect that list.
        missing = classifier.missing_fields or missing

    def has_minimum_resume(data: dict[str, str]) -> bool:
        has_name = bool(data.get("name"))
        has_core = any(data.get(key) for key in ["work_history", "education", "skills", "contact", "target_role"])
        return has_name and has_core

    def has_minimum_invoice(data: dict[str, str]) -> bool:
        has_parties = data.get("your_business") and data.get("client")
        has_items = bool(data.get("line_items"))
        return bool(has_parties and has_items)

    has_minimum = True
    if doc_type == "resume":
        has_minimum = has_minimum_resume(collected)
    elif doc_type == "invoice":
        has_minimum = has_minimum_invoice(collected)

    # Never block generation - always proceed with what we have
    # Users can generate documents even with missing information
    if False:  # Disabled - never block generation
        preface = None
        if doc_type == "resume" and not has_minimum:
            preface = (
                "I only have a tiny bit so far. I need at least your name plus one of: contact, "
                "a role snippet, education, skills, or target role."
            )
        if doc_type == "invoice" and not has_minimum:
            preface = "Need who is billing, who is paying, and the line items so I don't invent details."
        logger.info(
            "[BRIEF] gating doc_type=%s missing=%s has_minimum=%s",
            doc_type,
            missing,
            has_minimum,
        )
        message = _ai_missing_message(doc_type, schema, collected, missing) or _format_missing_message(
            doc_type, schema, collected, missing, preface=preface
        )
        return {
            "needsInfo": True,
            "message": message,
            "collected": collected,
            "missing": missing,
        }

    # If fields are missing, let downstream generation know which areas to fill in plausibly
    # This allows generation to proceed even with missing information
    fabrication_hint = ""
    if missing:
        missing_labels = [schema.get("labels", {}).get(field, [field])[0] for field in missing[:5]]
        fabrication_hint = (
            "\n\nIf details are absent, invent plausible, clearly fictional details for: "
            + ", ".join(missing_labels)
            + "."
        )

    structured_lines = []
    for field in schema.get("field_order", []):
        value = collected.get(field)
        if value:
            label = schema.get("labels", {}).get(field, [field])[0]
            structured_lines.append(f"{label}: {value}")
    structured_brief = "\n".join(structured_lines)
    if fabrication_hint:
        structured_brief = (structured_brief + fabrication_hint).strip()
    # Always include the full user text - it contains all the details
    # For detailed prompts, this ensures nothing is lost
    if combined_text.strip():
        if structured_brief:
            structured_brief = (
                structured_brief + "\n\nCOMPLETE USER INPUT (use ALL information from this):\n" + combined_text
            ).strip()
        else:
            # If extraction found nothing, use the full text as the brief
            structured_brief = combined_text.strip()

    return {
        "needsInfo": False,
        "structured_brief": structured_brief or None,
        "collected": collected,
        "missing": missing,
    }


__all__ = ["gather_brief", "BRIEF_SCHEMAS", "_preprocess_intent"]
