from __future__ import annotations

import json
from typing import Dict, List, Optional, Any


# Shared rules
ALLOWED_LATEX_PACKAGES = [
    "geometry",
    "xcolor",
    "tabularx",
    "paracol",
    "multicol",
    "longtable",
    "setspace",
    "enumitem",
    "titlesec",
    "array",
    "inputenc",
    "fontenc",
    "tikz",
]

LATEX_RULES = [
    r"Output must start with \documentclass.",
    r"Output must contain exactly one \begin{document} and one \end{document}.",
    r"Do not output anything before \documentclass.",
    r"Do not output anything after \end{document}.",
    "Do not include commentary, apologies, or markdown fences.",
    "If uncertain, prefer simpler LaTeX over complex packages.",
    "Only use LaTeX packages from the allowlist in this prompt.",
    "Do not use fontspec or custom font commands.",
]


def latex_system_prompt(style_profile: Dict[str, Any], document_type: str, template_hint: Optional[str]) -> str:
    safe_style = {
        "font_preference": style_profile.get("font_preference", "default"),
        "tone": style_profile.get("tone", "professional"),
        "color_accent": style_profile.get("color_accent", "blue"),
        "layout_preference": style_profile.get("layout_preference", "clean"),
    }
    return (
        "You are a LaTeX document generator for PDFs.\n"
        f"User Style Profile (trimmed): {json.dumps(safe_style, sort_keys=True)}\n"
        f"Document Type: {document_type}\n"
        f"Template Hint present: {'yes' if template_hint else 'no'}\n"
        "Rules:\n"
        "1) Output ONLY valid LaTeX code.\n"
        f"- " + "\n- ".join(LATEX_RULES) + "\n"
        "2) Use only the allowlisted packages:\n"
        f"- " + "\n- ".join(ALLOWED_LATEX_PACKAGES) + "\n"
        f"3) Respect preferred font ({safe_style['font_preference']}), tone ({safe_style['tone']}), and color accent ({safe_style['color_accent']}).\n"
        "4) If a template hint is provided, stay close to its layout and styling.\n"
        "5) Do NOT add placeholder images or black boxes; omit images entirely unless an explicit path or real image content is provided. Do not use \\rule, tikz, or colored rectangles as image stand-ins.\n"
        "6) Return a full compilable document."
    )


def latex_context_messages(
    template_hint: Optional[str],
    current_latex: Optional[str],
    structured_brief: Optional[str],
) -> List[Dict[str, str]]:
    messages: List[Dict[str, str]] = []
    if template_hint:
        messages.append(
          {
              "role": "user",
              "content": f"REFERENCE TEMPLATE (keep style/layout, do not copy data):\n---\n{template_hint[:2000]}\n---",
          }
        )
    if current_latex:
        messages.append(
          {
              "role": "user",
              "content": f"CURRENT LATEX DRAFT (keep structure, apply edits):\n---\n{current_latex[:2000]}\n---",
          }
        )
    if structured_brief:
        messages.append(
          {
              "role": "user",
              "content": (
                  "Structured details gathered from the user (authoritative; do not invent beyond this):\n"
                  f"---\n{structured_brief}\n---"
              ),
          }
        )
    return messages


def pdf_qa_system_prompt() -> str:
    return (
        "You are a helpful assistant. Read the provided PDF text and answer the user's question.\n"
        "Respond with:\n"
        "Answer: 2–4 sentences summarizing the answer from the text.\n"
        "Evidence: 1–3 short quotes/snippets from the provided text (must be exact substrings).\n"
        "If the answer is not in the text, say: 'Not found in the provided text.' and give a best-effort summary."
    )


def brief_missing_info_system_prompt(doc_type: str) -> str:
    return (
        f"You are a brief-gathering assistant for generating a {doc_type}.\n"
        "Be conversational and concise. Ask at most 3 short questions; no multi-part questions.\n"
        "If the user hasn't given much, invite them to paste prior material or dump everything they remember.\n"
        "Do not invent data; only ask."
    )


def vision_layout_system_prompt() -> str:
    return (
        "You are a LaTeX layout extractor. Given page images of a PDF, return a LaTeX skeleton matching the layout and styling while blanking user content.\n"
        "Do NOT copy any readable text from images. Replace all text with placeholders like TITLE HERE, LOREM, XXXX.\n"
        "Infer margins, columns, header/footer, tables. Use \\rule{width}{height} placeholders sized to match blocks.\n"
        "Use common packages (geometry, xcolor, tabularx, multicol, paracol, tikz). Replace text with placeholders and output a full compilable document.\n"
        "Output ONLY LaTeX."
    )


__all__ = [
    "latex_system_prompt",
    "latex_context_messages",
    "pdf_qa_system_prompt",
    "brief_missing_info_system_prompt",
    "vision_layout_system_prompt",
    "LATEX_RULES",
]
