from __future__ import annotations

import re
import json
from typing import Any, Dict, List, Optional
import time

from config import CLIENT_MODE, FAST_MODEL, SMART_MODEL, get_chat_model, logger
from langchain_utils import to_lc_messages
from prompts import brief_missing_info_system_prompt


BRIEF_SCHEMAS: Dict[str, Dict[str, Any]] = {
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


def classify_intent_with_llm(prompt: str, history: List[Dict[str, str]], current_latex: Optional[str], has_pdf: bool) -> Optional[Dict[str, Any]]:
    """
    Use a small model to classify intent instead of brittle regex.

    Returns a dict like:
    {
      "documentType": "invoice|resume|contract|letter|report|form|document",
      "action": "new|edit|question",
      "allowFabrication": bool,
      "wantsPdf": bool,
      "hasEnoughInfo": bool,
      "missingFields": [str],
      "notes": str
    }
    """
    if CLIENT_MODE != "langchain":
        logger.info("[INTENT] skip llm classify: client_mode=%s", CLIENT_MODE)
        return None

    system = (
        "You classify user requests about documents. "
        "Output strict JSON. "
        "documentType must be one of: academic, agenda, brochure, business_card, case_study, checklist, "
        "contract, creative, datasheet, document, flyer, invoice, letter, manual, menu, minutes, newsletter, "
        "one_pager, poster, presentation, press_release, proposal, recipe, report, resume, timeline, whitepaper. "
        "action: 'new' (make/generate), 'edit' (modify existing), 'question' (asking about it). "
        "allowFabrication: true if the user invites making up/placeholder/dummy/random details "
        "OR asks you to use your knowledge about a fictional/real character (e.g., 'use what you know about James Bond', "
        "'make it for agent 007', 'create resume for Sherlock Holmes', etc.). "
        "Basically, if they're NOT providing their own personal details and expect you to fill in from common knowledge or imagination, set this to true. "
        "wantsPdf: true if they expect/gave permission to generate a PDF. "
        "hasEnoughInfo: true if there is enough info to proceed without asking questions (or if allowFabrication is true). "
        "missingFields: key details still needed (e.g., for invoice: seller, client, line items; resume: name, contact, work). "
        "notes: short free-form note."
    )

    conversation = [{"role": "system", "content": system}]
    # Trim history to keep request small
    trimmed_history = history[-6:] if len(history) > 6 else history
    for msg in trimmed_history:
        if msg.get("content") and msg.get("role") in {"user", "assistant", "system"}:
            conversation.append({"role": msg["role"], "content": msg["content"]})
    conversation.append({"role": "user", "content": prompt})

    try:
        llm = get_chat_model(
            FAST_MODEL or SMART_MODEL,
            max_tokens=800,
            model_kwargs={"response_format": {"type": "json_object"}},
        )
        if not llm:
            logger.info("[INTENT] skip llm classify: no LangChain client")
            return None
        start = time.perf_counter()
        response = llm.invoke(to_lc_messages(conversation))
        elapsed = time.perf_counter() - start
        content = response.content or ""
        usage = getattr(response, "usage_metadata", None)
        logger.info(
            "[INTENT] llm_classify model=%s elapsed=%.2fs chars=%s usage=%s",
            FAST_MODEL or SMART_MODEL,
            elapsed,
            len(str(content)),
            usage,
        )
        content = response.content
        if not content:
            logger.info("[INTENT] llm_classify empty content")
            return None
        data = json.loads(content)
        # Normalize
        doc_type = str(data.get("documentType") or "document").lower()
        allowed_types = {
            "academic", "agenda", "brochure", "business_card", "case_study", "checklist",
            "contract", "creative", "datasheet", "document", "flyer", "invoice", "letter",
            "manual", "menu", "minutes", "newsletter", "one_pager", "poster", "presentation",
            "press_release", "proposal", "recipe", "report", "resume", "timeline", "whitepaper"
        }
        if doc_type not in allowed_types:
            doc_type = "document"
        action = str(data.get("action") or "new").lower()
        if action not in {"new", "edit", "question"}:
            action = "new"
        result = {
          "documentType": doc_type,
          "action": action,
          "allowFabrication": bool(data.get("allowFabrication")),
          "wantsPdf": bool(data.get("wantsPdf", True)),
          "hasEnoughInfo": bool(data.get("hasEnoughInfo", True)),
          "missingFields": data.get("missingFields") or [],
          "notes": data.get("notes") or "",
        }
        logger.info(
            "[INTENT] llm_classify doc_type=%s action=%s allowFabrication=%s wantsPdf=%s hasEnoughInfo=%s missing=%s notes=%s",
            result["documentType"],
            result["action"],
            result["allowFabrication"],
            result["wantsPdf"],
            result["hasEnoughInfo"],
            result["missingFields"],
            (result["notes"] or "")[:120],
        )
        return result
    except Exception as exc:  # noqa: BLE001
        logger.error("[INTENT] LLM classify failed: %s", exc, exc_info=True)
        return None


def detect_fabrication_opt_in(prompt: str, history: List[Dict[str, str]]) -> bool:
    """
    Ask a small model to decide if the user has permitted invention of missing details.

    Returns True when the user says to make things up / whatever is fine /
    no preference, even if they haven't provided concrete fields.
    """
    if CLIENT_MODE != "langchain":
        return False

    system = (
        "Decide if the user has explicitly permitted you to invent or make up missing details. "
        "Reply with strict JSON: {\"allowFabrication\": true|false}. "
        "Consider any user instruction like 'make it up', 'whatever you want', 'use dummy info', "
        "'fabricate the rest', 'fill in anything' as permission. "
        "Do not require specific keywords; infer intent from the conversation. "
        "If unclear, set allowFabrication to false."
    )

    conversation = [{"role": "system", "content": system}]
    trimmed_history = history[-8:] if len(history) > 8 else history
    for msg in trimmed_history:
        if msg.get("content") and msg.get("role") in {"user", "assistant", "system"}:
            conversation.append({"role": msg["role"], "content": msg["content"]})
    conversation.append({"role": "user", "content": prompt})

    try:
        llm = get_chat_model(
            FAST_MODEL or SMART_MODEL,
            max_tokens=100,
            model_kwargs={"response_format": {"type": "json_object"}},
        )
        if not llm:
            return False
        start = time.perf_counter()
        response = llm.invoke(to_lc_messages(conversation))
        elapsed = time.perf_counter() - start
        content = response.content or ""
        usage = getattr(response, "usage_metadata", None)
        logger.info(
            "[INTENT] fabrication-check model=%s elapsed=%.2fs chars=%s usage=%s",
            FAST_MODEL or SMART_MODEL,
            elapsed,
            len(str(content)),
            usage,
        )
        content = response.content
        if not content:
            return False
        data = json.loads(content)
        return bool(data.get("allowFabrication"))
    except Exception as exc:  # noqa: BLE001
        logger.error("[INTENT] fabrication opt-in check failed: %s", exc)
        return False


def _preprocess_intent(
    prompt: str,
    history: List[Dict[str, str]],
    has_pdf: bool,
    current_latex: Optional[str],
) -> Dict[str, Any]:
    """
    Lightweight intent classifier used by /api/intent/check.

    It is intentionally heuristic-only to avoid extra model calls. The goal is to
    decide whether we should proceed with PDF generation and whether it's OK to
    fabricate placeholder content when the user explicitly asks for it.
    """
    user_texts = [entry.get("content", "") for entry in history if entry.get("role") == "user"]
    user_texts.append(prompt or "")
    combined_text = " ".join([t for t in user_texts if t]).strip().lower()

    llm = classify_intent_with_llm(prompt, history, current_latex, has_pdf)
    if llm:
        return {
            "wants_pdf": llm.get("wantsPdf", True),
            "has_enough_info": llm.get("hasEnoughInfo", True),
            "allow_makeup": llm.get("allowFabrication", False),
            "document_type": llm.get("documentType"),
            "missing_fields": llm.get("missingFields", []),
        }

    # Fallback heuristics (only if no LLM)
    avoid_pdf = bool(re.search(r"\b(no pdf|text only|markdown only|dont (make|generate) pdf)\b", combined_text))
    wants_pdf = not avoid_pdf or bool(current_latex) or has_pdf
    has_meaningful_text = len(combined_text) > 20
    return {
        "wants_pdf": wants_pdf,
        "has_enough_info": bool(current_latex or has_pdf or has_meaningful_text),
        "allow_makeup": False,
        "document_type": None,
        "missing_fields": [],
    }

def _extract_structured_fields(text: str, schema: Dict[str, Any]) -> Dict[str, str]:
    """Naively parse user text to pull schema fields."""
    found: Dict[str, str] = {}
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
    schema: Dict[str, Any],
    collected: Dict[str, str],
    missing: List[str],
    preface: Optional[str] = None,
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
    schema: Dict[str, Any],
    collected: Dict[str, str],
    missing: List[str],
) -> Optional[str]:
    """Let the model craft clarifying questions when available."""
    if CLIENT_MODE != "langchain" or not missing:
        return None

    collected_lines = [f"- {schema.get('labels', {}).get(field, [field])[0]}: {value}" for field, value in collected.items()]
    missing_labels = [schema.get("labels", {}).get(field, [field])[0] for field in missing]
    user_text = "We already have:\n" + "\n".join(collected_lines) if collected_lines else "We have nothing yet."
    user_text += "\nNeed to ask for: " + ", ".join(missing_labels)
    if not collected_lines:
        user_text += "\nInvite them to paste an old resume or dump all details if they have them."

    system_prompt = brief_missing_info_system_prompt(doc_type)
    try:
        llm = get_chat_model(SMART_MODEL, max_tokens=400)
        if not llm:
            return None
        start = time.perf_counter()
        response = llm.invoke(
            to_lc_messages(
                [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_text},
                ]
            )
        )
        elapsed = time.perf_counter() - start
        content = response.content or ""
        usage = getattr(response, "usage_metadata", None)
        logger.info(
            "[AI] missing-questions model=%s elapsed=%.2fs chars=%s usage=%s",
            SMART_MODEL,
            elapsed,
            len(str(content)),
            usage,
        )
        return response.content
    except Exception as exc:
        logger.error("[AI] missing-questions failed: %s", exc)
        return None


def gather_brief(doc_type: str, prompt: str, history: List[Dict[str, str]], current_latex: Optional[str] = None, has_pdf: bool = False) -> Dict[str, Any]:
    """
    Determine whether we have enough structured details to generate without fabricating.
    Returns needsInfo + a formatted message when details are missing, or a structured brief.
    """
    classifier = classify_intent_with_llm(prompt, history, current_latex, has_pdf)
    if classifier:
        doc_type = classifier.get("documentType", doc_type)
        logger.info(
            "[BRIEF] using llm doc_type=%s allowFabrication=%s missing=%s hasEnoughInfo=%s wantsPdf=%s",
            doc_type,
            classifier.get("allowFabrication"),
            classifier.get("missingFields"),
            classifier.get("hasEnoughInfo"),
            classifier.get("wantsPdf"),
        )
    else:
        logger.info("[BRIEF] llm classifier unavailable, using fallback schema doc_type=%s", doc_type)

    schema = BRIEF_SCHEMAS.get(doc_type)
    if not schema:
        return {"needsInfo": False, "structured_brief": None, "collected": {}, "missing": []}

    user_texts = [entry.get("content", "") for entry in history if entry.get("role") == "user"]
    user_texts.append(prompt or "")
    combined_text = "\n".join(user_texts)
    collected = _extract_structured_fields(combined_text, schema)
    missing = [field for field in schema.get("field_order", []) if field not in collected]
    classifier_has_enough = bool(classifier.get("hasEnoughInfo")) if classifier else True
    allow_makeup = bool(classifier.get("allowFabrication")) if classifier else False
    if not allow_makeup:
        allow_makeup = detect_fabrication_opt_in(prompt, history)
    if classifier and classifier.get("missingFields"):
        # If the model provided missing fields, respect that list.
        missing = classifier.get("missingFields") or missing

    # If the user gave no usable content, do not allow fabrication shortcuts.
    # Force the flow to ask for the required fields instead of silently proceeding.
    missing_all_fields = len(missing) == len(schema.get("field_order", []))
    low_signal_request = not collected and len(combined_text.strip()) < 12
    if missing_all_fields and low_signal_request:
        allow_makeup = False

    def has_minimum_resume(data: Dict[str, str]) -> bool:
        has_name = bool(data.get("name"))
        has_core = any(data.get(key) for key in ["work_history", "education", "skills", "contact", "target_role"])
        return has_name and has_core

    def has_minimum_invoice(data: Dict[str, str]) -> bool:
        has_parties = data.get("your_business") and data.get("client")
        has_items = bool(data.get("line_items"))
        return bool(has_parties and has_items)

    has_minimum = True
    if doc_type == "resume":
        has_minimum = has_minimum_resume(collected)
    elif doc_type == "invoice":
        has_minimum = has_minimum_invoice(collected)

    # Decide if we must pause to ask for details. Avoid regex "ready" guesses;
    # rely on the classifier's allowFabrication flag and collected data.
    must_ask_first = bool(missing) and ((not allow_makeup and not has_minimum) or not classifier_has_enough)
    if must_ask_first:
        preface = None
        if doc_type == "resume" and not has_minimum:
            preface = (
                "I only have a tiny bit so far. I need at least your name plus one of: contact, "
                "a role snippet, education, skills, or target role."
            )
        if doc_type == "invoice" and not has_minimum:
            preface = "Need who is billing, who is paying, and the line items so I don't invent details."
        logger.info(
            "[BRIEF] gating doc_type=%s missing=%s has_minimum=%s allowFabrication=%s",
            doc_type,
            missing,
            has_minimum,
            allow_makeup,
        )
        message = _ai_missing_message(doc_type, schema, collected, missing) or _format_missing_message(
            doc_type, schema, collected, missing, preface=preface
        )
        message += "\nIf you'd like me to invent anything you didn't share, just say so."
        return {
            "needsInfo": True,
            "message": message,
            "collected": collected,
            "missing": missing,
            "allowFabrication": allow_makeup,
        }

    # If fabrication is allowed but fields are missing, let downstream generation
    # know which areas to fill in plausibly.
    fabrication_hint = ""
    if allow_makeup and missing:
        fabrication_hint = "\n\nIf details are absent, invent plausible, clearly fictional details for: " + ", ".join(missing) + "."

    structured_lines = []
    for field in schema.get("field_order", []):
        value = collected.get(field)
        if value:
            label = schema.get("labels", {}).get(field, [field])[0]
            structured_lines.append(f"{label}: {value}")
    structured_brief = "\n".join(structured_lines)
    if fabrication_hint:
        structured_brief = (structured_brief + fabrication_hint).strip()
    if combined_text.strip():
        structured_brief = (structured_brief + "\n\nRaw user notes:\n" + combined_text).strip()

    return {
        "needsInfo": False,
        "structured_brief": structured_brief or None,
        "collected": collected,
        "missing": missing,
        "allowFabrication": allow_makeup,
    }


__all__ = ["gather_brief", "BRIEF_SCHEMAS", "_preprocess_intent"]
