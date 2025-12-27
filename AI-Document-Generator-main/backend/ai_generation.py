from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from config import CLIENT_MODE, SMART_MODEL, STREAMING_ENABLED, get_chat_model, logger
from langchain_utils import to_lc_messages
from storage import save_user_style
from prompts import latex_system_prompt, latex_context_messages


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
                response = llm.invoke(to_lc_messages(messages))
                return response.content
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
                for chunk in llm.stream(to_lc_messages(messages)):
                    if chunk.content:
                        yield chunk.content
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


__all__ = ["generate_latex_with_llm", "generate_latex_with_llm_stream"]
