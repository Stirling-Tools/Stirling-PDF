from __future__ import annotations

from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.contracts import format_conversation_history
from stirling.contracts.form_fill import (
    DocumentExtractionRequest,
    DocumentExtractionResponse,
    KnowledgeUpdateResponse,
    MultiProfileExtractionResponse,
)
from stirling.services import AppRuntime

SINGLE_DOC_SYSTEM_PROMPT = """\
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

MULTI_DOC_SYSTEM_PROMPT = """\
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

MAX_DOC_TEXT_CHARS = 10000


class DocumentExtractorAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self.single_doc_agent = Agent(
            model=runtime.smart_model,
            output_type=NativeOutput(KnowledgeUpdateResponse),
            system_prompt=SINGLE_DOC_SYSTEM_PROMPT,
            model_settings=runtime.smart_model_settings,
        )
        self.multi_doc_agent = Agent(
            model=runtime.smart_model,
            output_type=NativeOutput(MultiProfileExtractionResponse),
            system_prompt=MULTI_DOC_SYSTEM_PROMPT,
            model_settings=runtime.smart_model_settings,
        )

    async def extract_single(self, document_text: str, user_message: str = "") -> KnowledgeUpdateResponse:
        prompt = (
            f"User message: {user_message}\n\n"
            f"Document text:\n{document_text[:MAX_DOC_TEXT_CHARS]}\n\n"
            "Extract all personal information as structured key-value pairs."
        )
        result = await self.single_doc_agent.run(prompt)
        return result.output

    async def extract_multiple(self, request: DocumentExtractionRequest) -> DocumentExtractionResponse:
        docs_text = "\n\n".join(
            f"--- Document: {doc.file_name} ---\n{doc.text[:MAX_DOC_TEXT_CHARS]}" for doc in request.documents
        )
        existing = ", ".join(request.existing_profile_names) if request.existing_profile_names else "None"
        history = format_conversation_history(request.conversation_history)
        prompt = (
            f"Conversation history:\n{history}\n\n"
            f"Documents ({len(request.documents)} total):\n{docs_text}\n\n"
            f"Existing profile names (avoid conflicts): {existing}\n\n"
            "Identify distinct people, extract their information, and group by person."
        )
        result = await self.multi_doc_agent.run(prompt)
        return result.output
