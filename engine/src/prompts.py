from __future__ import annotations

import textwrap
from collections.abc import Sequence
from dataclasses import dataclass

from html_utils import DEFAULT_THEME_CSS
from models import ChatMessage, PdfPreflight, UploadedFileInfo
from models.tool_models import OperationId, ParamToolModel

# ── HTML generation rules ──────────────────────────────────────────────────────

HTML_RULES = [
    "Output must be a complete, valid HTML5 document.",
    "Must start with <!DOCTYPE html> and include <html>, <head>, and <body> tags.",
    "Do not output anything before <!DOCTYPE html>.",
    "Do not include commentary, apologies, or markdown fences.",
    "Do not include <script> tags or inline event handlers (onclick, onload, etc.).",
    "Do not link to external resources (no CDN URLs in <link> or <script> tags).",
    "All CSS must be inside <style> tags within <head>.",
    "Use @page { size: A4; } and @media print rules for correct PDF output.",
    "Layout rule (CRITICAL): Do NOT use <table>/<tr>/<td> for page layout or section grouping. "
    "Use <div>, <section>, or <article> for structural layout. "
    "Tables are ONLY for genuinely tabular/columnar data (e.g. invoice line items, schedules, comparison grids). "
    "Wrapping narrative sections, paragraphs, or multi-line blocks inside <tr> causes blank-space gaps on PDF pages.",
    "Page-break rules (REQUIRED): thead must use display: table-header-group so headers repeat on new pages. "
    "Compact data table rows (<tr> containing only short single-line cell values like amounts, dates, codes) "
    "MUST have break-inside: avoid; page-break-inside: avoid. "
    "Rows that contain multi-line text, paragraphs, or nested block elements MUST NOT have break-inside: avoid "
    "— forcing them to stay intact causes large blank gaps on pages; let them flow naturally across page breaks instead. "
    "Section headings and paragraph titles must have break-after: avoid; page-break-after: avoid to keep them with the content that follows. "
    "Body sections, narrative paragraphs, legal clauses, and any section that can span more than half a page MUST NOT have break-inside: avoid "
    "— these must be allowed to flow freely across page breaks. "
    "Only these compact atomic block elements should have break-inside: avoid; page-break-inside: avoid: "
    "signature blocks, totals/summary boxes, net-pay boxes, key-terms boxes, small key-value grids, and other blocks "
    "that are short enough (under ~10 lines) to always fit on one page.",
]


def html_system_prompt(document_type: str, template_hint: str | None) -> str:
    from format_prompts import get_format_prompt

    _, format_sections = get_format_prompt(document_type)
    sections_guidance = ""
    if format_sections and isinstance(format_sections, list):
        sections_list = ", ".join([s if isinstance(s, str) else s.get("label", "") for s in format_sections])
        sections_guidance = f"\n\nFor a {document_type}, include these sections: {sections_list}. Create a complete, professional document with all relevant sections populated."

    return (
        "You are an HTML document generator for PDFs.\n"
        f"Document Type: {document_type}\n"
        f"Template Hint present: {'yes' if template_hint else 'no'}\n"
        f"{sections_guidance}\n"
        "CRITICAL INSTRUCTIONS - READ CAREFULLY:\n"
        "1) When structured details or COMPLETE USER INPUT are provided, they contain ALL the information you need.\n"
        "2) Extract EVERY piece of information from the provided details and use it to populate the document.\n"
        "3) DO NOT output just a skeleton - create a COMPLETE document with ALL sections fully populated.\n"
        "3b) OMIT sections entirely when the user has provided no data for them. Do NOT render a section\n"
        "   heading with blank or placeholder content (e.g. '—', 'N/A', '[blank]'). Optional sections\n"
        "   like Special Instructions, Terms and Conditions, Notes, Remarks, or Additional Info must be\n"
        "   left out of the HTML completely if no content was provided — an absent section is always\n"
        "   better than a blank one.\n"
        "4) All CSS must be self-contained inside <style> tags. No external stylesheets or CDN links.\n"
        "5) Use CSS variables for theming. The default theme variables and their values are:\n"
        f"{DEFAULT_THEME_CSS}\n"
        "   Always place {{THEME_CSS}} as the FIRST rule inside your <style> block so the variable "
        "block is defined before any rules that reference it.\n"
        "   Color/tone intelligence rules:\n"
        "   - If the user's prompt requests specific colors (e.g. 'red and yellow', 'gold and navy'), "
        "write element CSS using those concrete colors directly instead of var(--theme-*) references "
        "— but still include {{THEME_CSS}} so the variable block is defined.\n"
        "   - If the user requests a formal, plain, serious, or black-and-white document, use a minimal "
        "monochrome color scheme with concrete CSS values (#000, #fff, #333, etc.) instead of theme "
        "variable references.\n"
        "6) FILLABLE TEMPLATES: If you receive a template with {{PLACEHOLDER}} tokens, preserve ALL HTML "
        "structure and CSS EXACTLY. Only replace {{PLACEHOLDER}} tokens with actual data.\n"
        "Rules:\n"
        "1) Output ONLY valid HTML5 code.\n"
        f"- " + "\n- ".join(HTML_RULES) + "\n"
        "2) Use proper print CSS: @page { size: A4; margin: 20mm; } for PDF output.\n"
        "3) If a fillable template is provided (with {{PLACEHOLDER}} tokens), preserve it EXACTLY.\n"
        "4) Return a full, self-contained HTML5 document."
    )


def html_context_messages(
    template_hint: str | None,
    current_html: str | None,
    structured_brief: str | None,
) -> list[ChatMessage]:
    messages: list[ChatMessage] = []
    if template_hint:
        has_placeholders = "{{" in template_hint and "}}" in template_hint
        if has_placeholders:
            messages.append(
                ChatMessage(
                    role="user",
                    content=(
                        "FILLABLE TEMPLATE (preserve ALL HTML/CSS structure EXACTLY — only fill {{PLACEHOLDER}} tokens):\n"
                        f"---\n{template_hint}\n---\n"
                        "CRITICAL: Copy the entire template. Only replace {{PLACEHOLDER}} tokens with actual data."
                    ),
                )
            )
        else:
            messages.append(
                ChatMessage(
                    role="user",
                    content=f"REFERENCE TEMPLATE (keep style/layout, do not copy data):\n---\n{template_hint[:3000]}\n---",
                )
            )
    if current_html:
        messages.append(
            ChatMessage(
                role="user",
                content=f"CURRENT HTML DRAFT (keep structure, apply edits):\n---\n{current_html[:3000]}\n---",
            )
        )
    if structured_brief:
        messages.append(
            ChatMessage(
                role="user",
                content=(
                    "Structured details gathered from the user (authoritative; do not invent beyond this):\n"
                    f"---\n{structured_brief}\n---"
                ),
            )
        )
    return messages


def html_polish_prompt(doc_type: str, constraint_text: str) -> str:
    return (
        f"Create a polished HTML document for a {doc_type}.\n"
        "Use the provided section content and keep the substance consistent.\n"
        f"{constraint_text}\n"
        "IMPORTANT: Only render sections for which actual content was provided. "
        "If a section (e.g. Special Instructions, Terms and Conditions, Notes, Remarks) "
        "has no data from the user, omit it entirely — do not render its heading or a blank/dash placeholder. "
        "An absent section is always better than a blank one.\n"
        "Output only a complete, self-contained HTML5 document.\n"
        "Include all CSS in <style> tags. Use @page { size: A4; } for proper PDF output.\n"
        "Use CSS variables for theming. The default theme variables and their values are:\n"
        f"{DEFAULT_THEME_CSS}\n"
        "Always place {{THEME_CSS}} as the FIRST rule inside your <style> block so the variable "
        "block is defined before any rules that reference it.\n"
        "Color/tone intelligence rules:\n"
        "- If the user's prompt requests specific colors (e.g. 'red and yellow', 'gold and navy'), "
        "write element CSS using those concrete colors directly instead of var(--theme-*) references "
        "— but still include {{THEME_CSS}} so the variable block is defined.\n"
        "- If the user requests a formal, plain, serious, or black-and-white document, use a minimal "
        "monochrome color scheme with concrete CSS values (#000, #fff, #333, etc.) instead of theme "
        "variable references.\n"
    )


def template_fill_html_system_prompt(constraints_text: str) -> str:
    return (
        "You are an HTML document template filler.\n"
        "Return the full HTML document with {{PLACEHOLDER}} tokens replaced with REAL data from the user's input.\n"
        "\n"
        "CRITICAL — PRESERVE THE TEMPLATE STRUCTURE:\n"
        "1) Keep ALL HTML tags, attributes, class names, IDs, and <style> blocks EXACTLY as-is\n"
        "2) Do NOT modify any CSS, layout, or structural HTML\n"
        "3) Do NOT add or remove HTML elements — EXCEPTIONS:\n"
        "   a) If a table column or repeating element would receive the same generic filler across every row\n"
        "      (e.g. 'unit', 'ea', 'each', 'item', 'N/A', '—') because the data simply doesn't include that\n"
        "      dimension, omit that column entirely (remove both the <th> header and the <td> in every row).\n"
        "   b) If no data is available for an optional section (e.g. Special Instructions, Terms and Conditions,\n"
        "      Notes, Remarks, Additional Info), remove the ENTIRE section — the section heading element AND\n"
        "      its content element(s) — completely from the output. Do NOT leave a heading with blank or dash\n"
        "      content. An absent section is always better than a blank one.\n"
        "4) For table rows, match ONLY the columns that appear in the template's <thead> — never add\n"
        "   extra columns that aren't in the header\n"
        "\n"
        "WHAT TO CHANGE — DATA PLACEHOLDERS ONLY:\n"
        "1) Replace {{PLACEHOLDER_NAME}} tokens with actual data values\n"
        "2) For multi-row content (e.g. {{LINEITEM_ROWS}}), generate complete <tr>...</tr> HTML rows\n"
        "   with exactly as many <td> cells as the <thead> has <th> columns\n"
        "3) For experience/education items (e.g. {{EXPERIENCE_ITEMS}}), generate complete <div class='entry'>...</div> blocks\n"
        "4) For skills (e.g. {{SKILLS_ITEMS}}), generate complete skill category divs\n"
        "5) Extract ALL information from the outline/context to fill the template\n"
        "6) For any remaining unfilled {{PLACEHOLDER}} token: if it is part of an optional section with no\n"
        "   user data, remove the entire section (heading + content). For required fields with no data\n"
        "   (e.g. a PO Number field in the header), leave them blank or use a minimal placeholder like\n"
        "   '[Not provided]' — never fill with '—', 'N/A', or invented content.\n"
        "\n"
        "OUTPUT REQUIREMENTS:\n"
        "1) Output ONLY the complete HTML document (no markdown fences, no explanations)\n"
        "2) The document must be valid, self-contained HTML5\n"
        f"{constraints_text}\n"
        "\n"
        "REMEMBER: Copy the entire template structure, replacing {{PLACEHOLDER}} tokens with data.\n"
        "Remove entire sections (heading + content) when no data exists for them — never render blank sections.\n"
    )


def pdf_qa_system_prompt() -> str:
    return (
        "You are a helpful assistant. Read the provided PDF text and answer the user's question.\n"
        "Return JSON with:\n"
        "- answer: 2–4 sentences summarizing the answer from the text.\n"
        "- evidence: 1–3 short quotes/snippets from the provided text (must be exact substrings).\n"
        "If the answer is not in the text, answer with: 'Not found in the provided text.' and an empty evidence list."
    )


def brief_missing_info_system_prompt(doc_type: str) -> str:
    return (
        f"You are a brief-gathering assistant for generating a {doc_type}.\n"
        "Be conversational and concise. Ask at most 3 short questions; no multi-part questions.\n"
        "If the user hasn't given much, invite them to paste prior material or dump everything they remember.\n"
        "Do not invent data; only ask."
    )


# ---- Smart folder ----
def smart_folder_system_prompt(tool_list: str) -> str:
    return textwrap.dedent(f"""\
        Generate a smart folder configuration from the user's description and return JSON with:
        - assistantMessage: string (friendly message explaining what folder you're creating OR asking clarifying questions)
        - smartFolderConfig: object with name, description, automation, icon, accentColor (ONLY if user provided enough details)

        IMPORTANT: If the user's request is vague or lacks specific operations, DO NOT generate a config.
        Instead, set smartFolderConfig to null and use assistantMessage to show 3 EXAMPLE REQUESTS.

        Format your message EXACTLY like this:
        "Try these examples, or describe your own workflow:

        • Compress and split PDFs
        • Sanitize and flatten
        • Remove metadata then compress"

        Guidelines for examples:
        - MUST show at least 2 operations chained together (e.g., "compress and split", "sanitize then flatten")
        - Use operation keywords: compress, split, merge, remove, flatten, sanitize
        - Keep examples SHORT (under 6 words each)
        - Use bullet points (•) not numbers
        - DO NOT include purpose/use case (no "for email", "for web", etc.)

        CONFIGURATION REVIEW MODE: If the user asks to "review" or "modify" an existing configuration, DO NOT generate a new config.
        Instead, set smartFolderConfig to null and use assistantMessage to explain the current setup and suggest adjustments.

        Format your review message like this:
        "Your folder currently:
        1. [Operation name] - [explain parameters in plain language]
        2. [Operation name] - [explain parameters in plain language]

        You can adjust:
        • [Parameter option 1] - [how to change it]
        • [Parameter option 2] - [how to change it]
        • [Suggest adding another operation if relevant]"

        Guidelines for reviews:
        - Explain each parameter in plain language (e.g., "compressionLevel: 3" → "medium compression")
        - Suggest realistic parameter changes based on the tool's capabilities
        - Common adjustable parameters:
          * compress: compressionLevel (1=light, 3=medium, 5=heavy)
          * split: splitValue (MB size) or splitType
          * sanitize: removeJavaScript, removeEmbeddedFiles, removeMetadata
          * rotate: angle (90, 180, 270)
        - Keep suggestions conversational and helpful

        Smart Folder Config Structure:
        {{
          "name": "Folder Name (1-50 chars)",
          "description": "What this folder does (max 200 chars)",
          "automation": {{
            "name": "Automation Name",
            "description": "Optional automation description",
            "operations": [
              {{"operation": "tool_id", "parameters": "{{\\"param\\": \\"value\\"}}"}}
            ]
          }},
          "icon": "material_icon_name",
          "accentColor": "#RRGGBB"
        }}

        IMPORTANT: The "parameters" field must be a JSON string, not an object.

        Available Tools:
        {tool_list}

        Guidelines:
        1. Choose operations from the available tools list only
        2. Order operations logically (e.g., sanitize → compress → convert)
        3. Use sensible default parameters:
           - compress: {{"compressionLevel": 3}} (1=light, 3=medium, 5=heavy)
           - split: {{"splitType": "DIVIDE_BY_SIZE", "splitValue": "25"}} (MB)
           - rotate: {{"angle": 90}}
           - scale: {{"pageSize": "A4"}}
        4. Icon should be a Material icon name (e.g., "shield-lock", "mail", "rotate-right", "file-document")
        5. accentColor from palette: #9333ea (purple), #0ea5e9 (blue), #14b8a6 (teal), #f97316 (orange), #ef4444 (red), #10b981 (green)
        6. Name should be short and descriptive
        7. Description should explain the purpose/outcome
        8. CRITICAL: Operation IDs must EXACTLY match tool IDs from the available tools list
           - Use the exact 'id' field from the tool list (e.g., "compress-pdf", not "compress")
           - DO NOT create operation names - only use IDs from the provided list
           - If unsure, use the full tool ID including any suffixes
        9. Common tool ID patterns to remember:
           - Compression: "compress-pdf"
           - Split: "split-pdf-by-size-or-count"
           - Merge: "merge-pdfs"
           - Sanitize: "sanitize-pdf"
           - OCR: "ocr-pdf"
           - Flatten: "flatten"

        Example Response:
        {{
          "assistantMessage": "I'll create a smart folder called 'Email Preparation' that compresses PDFs and splits large files for easy email delivery.",
          "smartFolderConfig": {{
            "name": "Email Preparation",
            "description": "Compress and split PDFs for email delivery",
            "automation": {{
              "name": "Email Preparation Workflow",
              "description": "Optimizes PDFs for email attachment",
              "operations": [
                {{"operation": "compress-pdf", "parameters": {{"compressionLevel": 3}}}},
                {{"operation": "split-pdf-by-size-or-count", "parameters": {{"splitType": "DIVIDE_BY_SIZE", "splitValue": "25"}}}}
              ]
            }},
            "icon": "mail",
            "accentColor": "#0ea5e9"
          }}
        }}
    """)


# ---- Edit workflow: decisions ----
def edit_defaults_decision_system_prompt() -> str:
    return (
        "Decide if the user is asking the assistant to choose default parameters "
        "instead of providing specifics. Return use_defaults=true when the "
        "user clearly asks you to decide, says they don't know, wants defaults, "
        "OR when they make simple requests without specific technical requirements. "
        "Examples that should return true:\n"
        "  - 'make it smaller' (no compression level specified)\n"
        "  - 'compress this' (no technical details)\n"
        "  - 'optimize it' (simple request)\n"
        "  - 'rotate it' (angle usually implied)\n"
        "  - 'I don't know', 'use defaults', 'you choose'\n"
        "Examples that should return false:\n"
        "  - 'compress to 5MB' (specific requirement)\n"
        "  - 'rotate 180 degrees' (specific parameter)\n"
        "  - 'convert to grayscale and linearize' (specific settings)"
    )


def edit_intent_classification_system_prompt() -> str:
    return (
        "Classify the user's message as one of: command, info, ambiguous, or document_question.\n"
        "command = the user is asking you to run a tool on their file.\n"
        "info = the user is asking about capabilities, how tools work, or what options exist.\n"
        "document_question = the user is asking about the document's contents "
        "(summaries, what it says, what it's about, explain the file).\n"
        "ambiguous = unclear whether they want you to run a tool or just explain.\n"
        "If they ask to fix a PDF that doesn't open, is corrupted, or they can't select/copy text, treat it as command.\n\n"
        "CRITICAL: Set requires_file_context=true ONLY when the operation requires reading the document text.\n"
        "Examples that NEED file context: summarize, explain what this says, redact sensitive info, "
        "remove pages containing a keyword, find pages with a name, answer questions about content.\n"
        "Examples that DO NOT need file context (set false): rotate, compress, split, merge, "
        "add watermark, add password, convert, extract images, remove pages by number.\n"
        "Most PDF operations work on structure/pages, not content, so default to false.\n"
        "Conversation history may include assistant tool results as structured entries; use them when relevant.\n"
        "Return content matching the passed schema."
    )


def edit_info_system_prompt(file_name: str, file_type: str | None, catalog_text: str) -> str:
    return (
        "Answer the user's question about PDF tools or capabilities. "
        "Be clear and helpful; length is fine if it helps. "
        "Avoid jargon and do not ask multiple follow-up questions. "
        "Do not ask them to upload or provide a file. "
        "Explain how the relevant tool works and list its key options/parameters in plain language. "
        "Use bullets when listing options. "
        "End with exactly one short question asking if they want you to proceed. "
        f"Uploaded file: {file_name} ({file_type or 'unknown type'}).\n"
        f"Tool catalog JSON:\n{catalog_text}"
    )


def edit_missing_question_system_prompt() -> str:
    return (
        "Write a short, friendly follow-up message that asks for the missing required inputs. "
        "Use 1-2 sentences, conversational tone. "
        "Mention defaults when available and keep it non-technical. "
        "Ask at most one combined question."
    )


# ---- Edit workflow: confirmation ----
def confirmation_intent_system_prompt(pending_plan_summary: str) -> str:
    return (
        "The user is being asked to confirm an operation. Classify their response:\n"
        "- confirm: User agrees (yes, ok, confirm, proceed, do it, go ahead)\n"
        "- cancel: User cancels (no, cancel, stop, never mind, don't)\n"
        "- modify: User wants to change parameters in the same plan "
        "(actually..., change angle to..., make it page 7 instead)\n"
        "- new_request: User wants a completely different operation "
        "(compress it, rotate instead, do something else)\n"
        "- question: User asks about the plan "
        "(what will this do?, why?, how does this work?)\n\n"
        "CRITICAL: Never return confirm if the user says 'actually' or changes details.\n"
        f"Pending plan being confirmed:\n{pending_plan_summary}\n\n"
        "Return action and (if modify) modification_description explaining what changed."
    )


def confirmation_question_system_prompt(plan_summary: str, operation_ids: list[OperationId]) -> str:
    return (
        "Answer the user's question about the pending operation plan. "
        "Be clear and concise. Don't ask if they want to proceed - "
        "they'll confirm or cancel separately.\n\n"
        f"Pending plan:\n{plan_summary}\n\n"
        f"Operations: {operation_ids}"
    )


# ---- Chat routing ----
def chat_route_system_prompt(types_list: str) -> str:
    return textwrap.dedent(f"""\
        Route the user's message to the correct workflow and return JSON with:
        - intent: 'create' | 'edit' | 'smart_folder'
        - create_intent: {{action, doc_type}} (only when intent='create')
        - edit_intent: {{mode, requires_file_context}} (only when intent='edit')
        - smart_folder_intent: {{action}} (only when intent='smart_folder')
        - reason: string (fill in if not 100% clear)
        - suggested_title: string | null (only when request_title=true)

        Create intent:
        - Used if they want to generate a new document from scratch, or continue a creation flow
          (outline/draft/polish/generate PDF/regenerate outline)
        - action='start' when the user is describing a new document to create
        - action='generate_pdf' when the user wants to generate the PDF from an existing outline
        - action='regenerate_outline' when the user wants a new outline or wants to add more detail to the outline
        - Only use generate/regenerate actions if a create session exists or the message clearly
          refers to continuing the existing create flow.
        - doc_type: REQUIRED when action='start' - detect which document type from: {types_list}, other
          Use 'other' if the prompt doesn't clearly match a specific type.

        Edit intent:
        - Used if they want to modify/transform an existing PDF, ask about PDF tools,
          or continue an edit flow (confirm/cancel, parameter follow-ups).
        - mode='html_edit' when the user wants to change the visual content, wording, layout, or design of
          the document itself (e.g. "add a cover page", "change the color scheme", "update the title",
          "add a section about X", "make it look more professional"). Only valid when has_editable_html=true.
          If has_editable_html=false but the message sounds like an html_edit, still use html_edit — the
          frontend will handle the missing-HTML case gracefully.
        - mode='command' when the user wants to run a Stirling PDF tool on the file (compress, merge, split,
          rotate, watermark, add page numbers, OCR, convert format, etc.).
        - mode='info' when the user wants to explain tools/options.
        - mode='document_question' when the user is asking about document contents.
        - mode='ambiguous' when it is unclear what the user wants to do.
        - requires_file_context true only if the PDF's text must be extracted for the action to be performed.
          For example, summarising the PDF will require the extracted text, but adding page numbers won't.

        Smart folder intent:
        - Used if they want to create or configure a smart folder (automated PDF workflow).
        - action='create' when the user wants to create a new smart folder with specific operations.
        - action='configure' when they want to modify an existing smart folder's automation.
        - Keywords: "create folder", "make a folder", "automate", "workflow", "batch process"

        Use the provided context:
        - has_files indicates whether PDFs are in context.
        - has_editable_html indicates whether the active PDF has editable HTML (AI-generated or previously edited).
        - has_create_session & has_edit_session indicate ongoing workflows.
        - last_route is the previous routing choice (edit/create/none).

        Guidance:
        - If the message is 'generate pdf' or 'regenerate outline' AND a create session exists, intent='create'.
        - If the message is 'confirm'/'cancel'/'yes'/'no' and a session exists, match that session's route.
        - If the message explicitly mentions PDF editing operations (compress, merge, rotate, split, watermark, etc.),
          route to edit even if has_files is false - the system will prompt the user to upload files.
        - If ambiguous and not clearly an edit operation, prefer edit when has_files is true; otherwise prefer create.

        Example responses:
        - {{"intent": "create", "create_intent": {{"action": "start", "doc_type": "proposal"}}, "reason": "...", "suggested_title": "Business proposal"}}
        - {{"intent": "create", "create_intent": {{"action": "start", "doc_type": "invoice"}}, "reason": "...", "suggested_title": "Invoice for services"}}
        - {{"intent": "edit", "edit_intent": {{"mode": "html_edit", "requires_file_context": false}}, "reason": "User wants to add a cover page to the document", "suggested_title": "Add cover page"}}
        - {{"intent": "edit", "edit_intent": {{"mode": "command", "requires_file_context": false}}, "reason": "...", "suggested_title": "Compress and rotate files"}}
        - {{"intent": "smart_folder", "smart_folder_intent": {{"action": "create"}}, "reason": "User wants to create an automated workflow folder"}}
    """)


# ---- Document type classification ----
def document_type_classification_system_prompt(doctypes_list: str) -> str:
    return (
        "Classify the document type from the user's prompt. "
        "Use a value from this list:\n"
        f"{doctypes_list}\n\n"
        "If the prompt doesn't clearly match any specific type, use 'other'. "
        "Return the result in the response schema as doc_type."
    )


def outline_generator_system_prompt(
    document_type: str,
    constraint_text: str,
    format_prompt: str | None,
    default_sections: list | None,
) -> str:
    base = textwrap.dedent(
        f"""
        You are a document outline generator.
        Document type: {document_type}
        {constraint_text}

        Generate a structured outline by extracting information from the user's prompt.

        CRITICAL RULES:
        - Each section has 'label' (section name) and 'value' (actual content)
        - Extract REAL content from the user's prompt - don't make up data
        - If user didn't provide specific information, leave value empty
        - For multiple items (e.g., line items), use " | " separator: "Item 1 | Item 2"
        - Don't put descriptions in value - put ACTUAL CONTENT only
        - DO NOT fabricate information unless user explicitly asks to make up data
        - PLACEHOLDER UNIQUENESS: Each placeholder key must be unique if its value should be independent.
          Use descriptive, numbered keys for repeated field types (e.g., line items).
          CORRECT: "<<Item 1 Description>> | <<Item 2 Description>> | <<Item 3 Description>>"
          WRONG:   "<<Description>> | <<Description>> | <<Description>>"
          Only reuse the same key when the value is genuinely shared (e.g., company name appearing in multiple sections).

        Return doc_type="{document_type}", sections, and outline_filename in the response schema.
        outline_filename should be a short, descriptive file name (3-40 chars, ASCII only).
        """
    ).strip()
    if format_prompt:
        if default_sections:
            sections_text = ", ".join(sec if isinstance(sec, str) else sec.get("label", "") for sec in default_sections)
            base += f"\n\nExpected sections for {document_type}: {sections_text}"
        base += f"\n\nExtraction guidance:\n{format_prompt}"
    return base


def html_edit_system_prompt(document_type: str) -> str:
    return (
        f"You are editing an existing HTML document for a {document_type}.\n"
        "You will be given CURRENT_HTML and INSTRUCTIONS.\n\n"
        "CRITICAL RULES:\n"
        "- Output MUST be a single, complete HTML document (starting with <!doctype html> or <html>).\n"
        "- Return ONLY HTML. No markdown fences, no explanations, no commentary.\n"
        "- Preserve the original HTML EXACTLY unless a change is explicitly requested.\n"
        "- Do NOT reformat, reorder, or rename tags, classes, ids, or CSS variables.\n"
        "- Do NOT touch <style> blocks unless instructions explicitly ask for style changes.\n"
        "- Prefer the smallest possible change to satisfy the instruction.\n"
        "- If the instruction refers to 'here/this section', prefer the provided selected section context.\n"
        "- Treat any long encoded strings (e.g. base64, gzip/base64 blobs, data: URLs) as opaque: do NOT edit them.\n"
        "- The placeholder {{LOGO_BLOCK}} represents the company logo. Keep it in place unless the user explicitly asks to move or remove the logo.\n"
        "  - To move the logo: cut {{LOGO_BLOCK}} and paste it at the new location in the HTML.\n"
        "  - To remove the logo: delete {{LOGO_BLOCK}} entirely.\n"
        "  - Never remove template placeholders like {{HEADER_CSS}} or {{LOGO_BLOCK}} as part of unrelated edits.\n"
    )


def field_values_system_prompt(constraint_text: str) -> str:
    return (
        "You are extracting field values from a user prompt.\n"
        "Only fill values that are explicitly stated or strongly implied.\n"
        "If unknown, return an empty string.\n"
        f"{constraint_text}\n"
        "Return the field values in the provided schema."
    )


def section_draft_system_prompt(constraint_text: str) -> str:
    return (
        "You are generating section content for a document.\n"
        "Use the provided outline sections as labels; values should be polished draft text.\n"
        f"{constraint_text}\n"
        "Keep the total length appropriate to the target pages.\n"
        "Return the section list in the provided schema."
    )


def section_fill_system_prompt(
    document_type: str,
    document_prompt: str,
    sections_context: str,
    section_label: str,
    custom_prompt: str | None,
) -> str:
    task = (
        "User's specific request: " + custom_prompt
        if custom_prompt
        else "Generate sensible placeholder content based on the document type and context."
    )
    return (
        f"You are filling in a single section of a {document_type} document.\n\n"
        f"Document context: {document_prompt}\n\n"
        f"Other sections already filled:\n{sections_context}\n\n"
        f'Your task: Generate appropriate content for the "{section_label}" section.\n'
        f"{task}\n\n"
        "IMPORTANT:\n"
        "- If this section requires calculations (Total, Subtotal, Tax, etc.), perform the ACTUAL math based on the other sections\n"
        "- Return ONLY the content for this section - no labels, no explanations, just the value\n"
        "- For numeric values, use proper formatting (e.g., $76,492.50 not placeholders like TBD or \\1)\n"
        "- For line items or lists, separate items with | character\n"
        "- Keep it concise and appropriate for the section type\n"
        "- Return JSON matching the provided schema"
    )


def generate_all_sections_system_prompt(document_type: str) -> str:
    return (
        f"You are generating content for a {document_type} document.\n\n"
        "CRITICAL RULES:\n"
        "- Only fill in values that make sense based on the user's prompt\n"
        "- If the user didn't mention specific details, use sensible placeholders like '<<Your Name>>' or '<<Company>>'\n"
        "- For line items or lists, separate items with | character\n"
        "- PLACEHOLDER UNIQUENESS: Each placeholder key must be unique if its value should be independent.\n"
        "  Use descriptive, numbered keys for repeated field types within the same section.\n"
        "  CORRECT: '<<Item 1 Description>> | <<Item 2 Description>> | <<Item 3 Description>>'\n"
        "  WRONG:   '<<Description>> | <<Description>> | <<Description>>'\n"
        "  Only reuse the same key when the value is genuinely shared (e.g., company name appearing multiple times).\n"
    )


@dataclass(frozen=True)
class ToolParamEntry:
    name: str
    python_name: str
    required: bool
    type: str
    description: str | None


@dataclass(frozen=True)
class ToolParamIndex:
    params: list[ToolParamEntry]


def _format_preflight(preflight: PdfPreflight | None, indent: str) -> str:
    if preflight is None:
        return "- none"
    encrypted = "true" if preflight.is_encrypted else "false" if preflight.is_encrypted is not None else "null"
    has_text = "true" if preflight.has_text_layer else "false" if preflight.has_text_layer is not None else "null"
    return f"\n{indent}".join(
        [
            f"- file_size_mb: {preflight.file_size_mb}",
            f"- is_encrypted: {encrypted}",
            f"- page_count: {preflight.page_count}",
            f"- has_text_layer: {has_text}",
        ]
    )


def _format_uploaded_files(uploaded_files: Sequence[UploadedFileInfo], indent: str) -> str:
    if not uploaded_files:
        return "- none"
    return f"\n{indent}".join(f"- {file.name or 'unknown'} ({file.type or 'unknown'})" for file in uploaded_files)


def _format_tool_catalog(tool_catalog: Sequence[OperationId], indent: str) -> str:
    if not tool_catalog:
        return "- none"
    operations = ", ".join(str(operation_id) for operation_id in tool_catalog)
    return f"- count={len(tool_catalog)}\n{indent}- operation_ids: {operations}"


def edit_tool_selection_system_prompt(
    *,
    uploaded_files: Sequence[UploadedFileInfo],
    preflight: PdfPreflight | None,
    tool_catalog: Sequence[OperationId],
) -> str:
    indent = "        "
    uploaded_files_text = _format_uploaded_files(uploaded_files, indent)
    preflight_text = _format_preflight(preflight, indent)
    tool_catalog_text = _format_tool_catalog(tool_catalog, indent)
    return textwrap.dedent(
        f"""
        You select PDF tool operations from the provided tool catalog.
        Use only operation_ids that exist in tool_catalog.

        Decision policy:
        - action=call_tool when intent is identifiable. Include operation_ids in execution order.
        - action=ask_user when intent is ambiguous. Ask one short follow-up question.
        - action=no_tool when request is out of scope for available PDF tools.

        Rules:
        - If action=call_tool, operation_ids must be non-empty.
        - If action=call_tool, set response_message to null.
        - If action=ask_user or action=no_tool, response_message may be used and should be short.
        - If request contains multiple actions, include all operation_ids in order.
        - Do not add speculative operations.
        - Never ask for fileInput or fileId.

        Examples:
        - "compress and rotate 90 clockwise" -> action=call_tool, operation_ids=["compress","rotate"], response_message=null
        - "what can you do?" -> action=ask_user, operation_ids=[]

        Context:
        uploaded_files:
        {uploaded_files_text}
        preflight:
        {preflight_text}
        tool_catalog:
        {tool_catalog_text}
        """
    ).strip()


def edit_tool_clarification_prompt() -> str:
    return textwrap.dedent(
        """
        You are deciding whether to ask a follow-up question before running a PDF tool.
        If optional parameters materially affect quality or output, ask the user instead of guessing.
        If existing parameters are sufficient, respond with action=proceed.
        If you ask a question, keep it short and non-technical, and ask at most 1-2 combined preferences.
        Always mention you can use standard defaults if they don't care.
        The file is already uploaded; never ask the user to upload or provide a PDF.
        Conversation history may include assistant tool results as structured entries; use them when relevant.
        """
    ).strip()


def edit_tool_parameter_fill_prompt(
    *,
    operation_id: OperationId,
    preflight: PdfPreflight | None,
    parameter_catalog: ToolParamIndex,
    previous_operations: Sequence[tuple[OperationId, ParamToolModel | None]],
) -> str:
    indent = "        "
    preflight_text = _format_preflight(preflight, indent)
    parameter_catalog_text = (
        f"\n{indent}".join(
            (
                f"- {item.name} (python_name={item.python_name}, required={item.required}, "
                f"type={item.type}, description={item.description!r})"
            )
            for item in parameter_catalog.params
        )
        or "- none"
    )
    previous_operations_text = (
        f"\n{indent}".join(
            (
                f"- operation_id={operation_name}, "
                f"params={params.model_dump(by_alias=True, exclude_none=True, exclude_unset=True) if params else None}"
            )
            for operation_name, params in previous_operations
        )
        or "- none"
    )
    return textwrap.dedent(
        f"""
        You fill parameters for one PDF operation.
        Return only parameters you can confidently infer from the user message and context.
        Omit optional parameters not explicitly requested so defaults can apply.
        Use only parameters listed in parameter_catalog and match expected types.
        Never ask for fileInput or fileId.
        If user says "use defaults" (or equivalent), return an empty object.

        Context:
        operation_id: {operation_id}
        preflight:
        {preflight_text}
        parameter_catalog:
        {parameter_catalog_text}
        previous_operations:
        {previous_operations_text}
        """
    ).strip()


def edit_missing_parameter_fill_prompt() -> str:
    return textwrap.dedent(
        """
        Fill in missing parameters for a PDF tool based on the user's follow-up message.
        Return only parameters you can confidently infer.
        Do not invent values; if the user is unsure, leave parameters empty.
        The file is already uploaded; never ask the user to upload or provide a PDF.
        Conversation history may include assistant tool results as structured entries; use them when relevant.
        CRITICAL: Parameter values must match their expected types.
        NEVER use boolean values (true/false) for non-boolean parameters.
        For numeric parameters (like angle, rotation, dpi), use the actual number (e.g., 90, not true).
        For string parameters, use the actual string value.
        For array parameters, use an actual array.
        Only use boolean true/false for parameters that are explicitly boolean type.
        """
    ).strip()


def edit_followup_intent_prompt() -> str:
    return textwrap.dedent(
        """
        Classify whether the user's message is answering a prior missing-parameters question
        or starting a new request.
        fill_missing = the user is giving values or saying use defaults.
        new_request = the user is changing the requested tools or asking for new actions.
        info = asking about capabilities/options.
        """
    ).strip()


__all__ = [
    "HTML_RULES",
    "ToolParamEntry",
    "ToolParamIndex",
    "brief_missing_info_system_prompt",
    "html_context_messages",
    "html_polish_prompt",
    "html_edit_system_prompt",
    "html_system_prompt",
    "template_fill_html_system_prompt",
    "chat_route_system_prompt",
    "confirmation_intent_system_prompt",
    "confirmation_question_system_prompt",
    "document_type_classification_system_prompt",
    "edit_defaults_decision_system_prompt",
    "edit_info_system_prompt",
    "edit_intent_classification_system_prompt",
    "edit_missing_question_system_prompt",
    "field_values_system_prompt",
    "generate_all_sections_system_prompt",
    "outline_generator_system_prompt",
    "pdf_qa_system_prompt",
    "section_draft_system_prompt",
    "section_fill_system_prompt",
    "smart_folder_system_prompt",
    "edit_tool_selection_system_prompt",
    "edit_tool_clarification_prompt",
    "edit_tool_parameter_fill_prompt",
    "edit_missing_parameter_fill_prompt",
    "edit_followup_intent_prompt",
]
