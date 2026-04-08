from __future__ import annotations

from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.contracts import ConversationMessage
from stirling.contracts.form_fill import (
    DocumentExtractionRequest,
    DocumentExtractionResponse,
    FormField,
    FormFillClarificationResponse,
    FormFillRequest,
    FormFillResponse,
    FormFillResultResponse,
    KnowledgeUpdateResponse,
    MultiProfileExtractionResponse,
    RoleConfirmationResponse,
    RoleDetectionResult,
)
from stirling.services import AppRuntime

FIELD_MATCHER_SYSTEM_PROMPT = """\
You are a PDF form field matcher. You receive a list of PDF form fields and a knowledge \
dictionary of confirmed user information.

Your job:
1. ROLE DETECTION: Analyze the form to identify distinct sections and the role each represents. \
Use field name prefixes (e.g. "Client" vs "Beneficiary"), nearby page text section headers, \
and form context to group fields by role. Return this in role_detection.

2. CONFIDENCE SCORING for primary_confidence (0.0 to 1.0):
   - 0.9-1.0: Clear primary-person keywords in field names or page text (Client, Applicant, \
Employee, Patient, Account Holder, Policyholder, Tenant, Borrower) AND only one plausible \
primary section.
   - 0.7-0.9: Section headers suggest a primary person but terminology is ambiguous (e.g. \
"Party A" vs "Party B"), or the form title suggests the user might be an unusual role \
(e.g. claim form where user = claimant, not policyholder).
   - 0.5-0.7: Multiple sections could plausibly be the primary person, or generic labels \
like "Name" without section context.
   - Below 0.5: No section structure detected, or all sections appear to be for third parties.
   In confidence_reasoning, state which specific signals you used.
   If the form has only one section or no section distinction, set primary_confidence to 1.0.

3. FIELD MATCHING: Match form fields to knowledge entries where the field is clearly asking \
for the same information, just worded differently. ONLY fill fields in the detected primary \
person section. Return these as filled_fields.

4. INTERNAL FIELDS: Identify system fields (form IDs, submission references, tracking codes, \
barcodes, buttons, submit buttons). Return their field names in skipped_field_names.

5. LABEL CLEANUP: For fields with unreadable labels (numeric codes, technical IDs, brackets, \
underscores), find the real label from nearby page text and return it in cleaned_labels. \
Use page text verbatim. Do not clean labels that are already readable.

{role_override_instruction}

STRICT RULES:
- ONLY fill fields belonging to the primary person section.
- ONLY fill a field if a knowledge entry is clearly the same information.
- For checkbox fields: value must be "Yes" or "Off".
- For radio/combobox/listbox fields: value MUST be one of the field's options.
- Skip read-only fields entirely.
- role_detection is REQUIRED in every response.
"""

ROLE_OVERRIDE_INSTRUCTION = """\
ROLE OVERRIDE: The user has confirmed they are the "{role_label}" in this form. \
Treat all fields in that section as the primary person section unconditionally. \
Set primary_confidence to 1.0."""

DOCUMENT_EXTRACTOR_SYSTEM_PROMPT = """\
You extract structured personal information from document text. The user has uploaded a document \
(CV, ID, utility bill, etc.) and wants to store the extracted information for future form filling.

STRICT RULES:
- Only extract information that is explicitly stated in the document. Never infer or guess.
- Use consistent snake_case keys. Preferred keys include: first_name, last_name, full_name, \
date_of_birth, email, phone, address_line_1, address_line_2, city, state, zip_code, country, \
job_title, company, nationality, gender, marital_status, passport_number, driver_license_number, \
social_security_number, tax_id.
- Use additional descriptive keys when the information doesn't fit the preferred keys.
- Set the source field to describe the document type (e.g., "extracted from CV", \
"extracted from utility bill").
- Provide a brief summary message listing what was extracted.
"""

MULTI_DOC_EXTRACTOR_SYSTEM_PROMPT = """\
You receive text from one or more documents. Your job is to extract personal information and \
determine how many distinct people are represented.

RULES:
- Analyze all documents to identify distinct individuals. Look for different names, different \
contact details, different employment histories, etc.
- If all documents belong to one person, return a single profile.
- If documents belong to different people, group entries by person and return separate profiles.
- For each profile, suggest a name using the person's actual name if found (e.g. "John Smith"). \
If no name is found, use a descriptive name like "Person from document2.pdf".
- Avoid suggesting profile names that conflict with the existing_profile_names list.
- Use consistent snake_case keys: first_name, last_name, full_name, date_of_birth, email, \
phone, address_line_1, address_line_2, city, state, zip_code, country, job_title, company, \
nationality, gender, etc.
- Only extract information explicitly stated in the documents. Never infer or guess.
- Set the source field to indicate which document the entry came from.
"""

CONFIDENCE_THRESHOLD_AUTO = 0.9
CONFIDENCE_THRESHOLD_CONFIRM = 0.5
MAX_PAGE_TEXT_CHARS = 1500


class FormFillAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self.field_matcher = Agent(
            model=runtime.smart_model,
            output_type=NativeOutput(FormFillResultResponse),
            system_prompt=FIELD_MATCHER_SYSTEM_PROMPT.format(role_override_instruction=""),
            model_settings=runtime.smart_model_settings,
        )
        self.document_extractor = Agent(
            model=runtime.smart_model,
            output_type=NativeOutput(KnowledgeUpdateResponse),
            system_prompt=DOCUMENT_EXTRACTOR_SYSTEM_PROMPT,
            model_settings=runtime.smart_model_settings,
        )
        self.multi_doc_extractor = Agent(
            model=runtime.smart_model,
            output_type=NativeOutput(MultiProfileExtractionResponse),
            system_prompt=MULTI_DOC_EXTRACTOR_SYSTEM_PROMPT,
            model_settings=runtime.smart_model_settings,
        )

    async def handle(self, request: FormFillRequest) -> FormFillResponse:
        if request.extracted_document_text and not request.form_fields:
            return await self._extract_knowledge(request)
        if not request.form_fields:
            return FormFillClarificationResponse(
                question="Please upload a PDF form or a document to extract information from.",
                reason="No form fields or document text provided.",
            )
        return await self._fill_form(request)

    async def _fill_form(self, request: FormFillRequest) -> FormFillResponse:
        response = await self._run_fill_agent(request)

        # If role override or preference match, return as-is
        if request.role_override or self._preference_matches(request, response):
            return response

        # Evaluate confidence
        if response.role_detection and response.role_detection.primary_confidence < CONFIDENCE_THRESHOLD_AUTO:
            return RoleConfirmationResponse(
                role_detection=response.role_detection,
                suggested_primary=response.role_detection.primary_role_label or "Unknown",
                question=self._build_confirmation_question(response.role_detection),
                provisional_fills=response.filled_fields,
                cleaned_labels=response.cleaned_labels,
                skipped_field_names=response.skipped_field_names,
            )

        return response

    async def _run_fill_agent(self, request: FormFillRequest) -> FormFillResultResponse:
        role_instruction = ""
        if request.role_override:
            role_instruction = ROLE_OVERRIDE_INSTRUCTION.format(role_label=request.role_override)

        prompt = self._build_fill_prompt(request)

        if role_instruction:
            agent = Agent(
                model=self.runtime.smart_model,
                output_type=NativeOutput(FormFillResultResponse),
                system_prompt=FIELD_MATCHER_SYSTEM_PROMPT.format(role_override_instruction=role_instruction),
                model_settings=self.runtime.smart_model_settings,
            )
        else:
            agent = self.field_matcher

        result = await agent.run(prompt)
        return result.output

    async def _extract_knowledge(self, request: FormFillRequest) -> KnowledgeUpdateResponse:
        prompt = self._build_extraction_prompt(request)
        result = await self.document_extractor.run(prompt)
        return result.output

    async def extract_documents(self, request: DocumentExtractionRequest) -> DocumentExtractionResponse:
        docs_text = "\n\n".join(f"--- Document: {doc.file_name} ---\n{doc.text[:10000]}" for doc in request.documents)
        existing = ", ".join(request.existing_profile_names) if request.existing_profile_names else "None"
        prompt = (
            f"Documents ({len(request.documents)} total):\n{docs_text}\n\n"
            f"Existing profile names (avoid conflicts): {existing}\n\n"
            "Identify distinct people, extract their information, and group by person."
        )
        result = await self.multi_doc_extractor.run(prompt)
        return result.output

    def _preference_matches(self, request: FormFillRequest, response: FormFillResultResponse) -> bool:
        pref = request.knowledge.get("_role_preference", "")
        if not pref or not response.role_detection:
            return False
        keywords = [k.strip().lower() for k in pref.split(",") if k.strip()]
        primary_label = (response.role_detection.primary_role_label or "").lower()
        return any(kw in primary_label for kw in keywords)

    def _build_confirmation_question(self, detection: RoleDetectionResult) -> str:
        if detection.primary_confidence >= CONFIDENCE_THRESHOLD_CONFIRM:
            return f"Are you the '{detection.primary_role_label}' in this form?"
        role_labels = [r.role_label for r in detection.detected_roles]
        return f"Which section describes you? Detected sections: {', '.join(role_labels)}"

    def _build_fill_prompt(self, request: FormFillRequest) -> str:
        # Deduplicate page texts by content, truncate each
        page_texts: dict[str, int] = {}
        field_page_map: dict[str, int] = {}
        for field in request.form_fields:
            if field.nearby_page_text:
                text = field.nearby_page_text
                if text not in page_texts:
                    page_texts[text] = len(page_texts)
                field_page_map[field.name] = page_texts[text]

        page_section = "\n".join(f"[Page {pid}]: {text[:MAX_PAGE_TEXT_CHARS]}" for text, pid in page_texts.items())

        fields_text = "\n".join(
            self._format_form_field(field, field_page_map.get(field.name)) for field in request.form_fields
        )
        knowledge_text = (
            "\n".join(f"- {key}: {value}" for key, value in request.knowledge.items() if not key.startswith("_"))
            if request.knowledge
            else "No knowledge entries available."
        )
        history_text = self._format_conversation_history(request.conversation_history)
        return (
            f"User message: {request.user_message}\n\n"
            f"Conversation history:\n{history_text}\n\n"
            f"Known user information:\n{knowledge_text}\n\n"
            f"Page texts:\n{page_section}\n\n"
            f"Form fields:\n{fields_text}\n\n"
            "Detect roles, match fields to knowledge for the primary person only. "
            "Return cleaned labels for unreadable field names. "
            "Return skipped_field_names for internal/system fields."
        )

    def _build_extraction_prompt(self, request: FormFillRequest) -> str:
        history_text = self._format_conversation_history(request.conversation_history)
        return (
            f"User message: {request.user_message}\n\n"
            f"Conversation history:\n{history_text}\n\n"
            f"Document text:\n{request.extracted_document_text}\n\n"
            "Extract all personal information as structured key-value pairs."
        )

    def _format_form_field(self, field: FormField, page_id: int | None) -> str:
        parts = [f"- name={field.name}, type={field.type}"]
        if field.label:
            parts.append(f"  label={field.label}")
        if field.tooltip:
            parts.append(f"  tooltip={field.tooltip}")
        if field.options:
            parts.append(f"  options={field.options}")
        if field.required:
            parts.append("  required=true")
        if field.read_only:
            parts.append("  readOnly=true")
        if page_id is not None:
            parts.append(f"  page={page_id}")
        return "\n".join(parts)

    def _format_conversation_history(self, conversation_history: list[ConversationMessage]) -> str:
        if not conversation_history:
            return "None"
        return "\n".join(f"- {message.role}: {message.content}" for message in conversation_history)
