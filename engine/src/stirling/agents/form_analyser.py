from __future__ import annotations

from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.contracts.form_fill import (
    FormAnalysisRequest,
    FormAnalysisResponse,
    FormField,
)
from stirling.services import AppRuntime

FORM_ANALYSER_SYSTEM_PROMPT = """\
You are a PDF form analyser. You receive field metadata from one or more PDF forms.

Your job (analysis ONLY — do NOT fill any values):

1. PER-FILE ROLE DETECTION: For each file, identify distinct sections and the role each \
represents. Use field name prefixes (e.g. "Client" vs "Beneficiary"), nearby page text \
section headers, and form context to group fields by role. Mark which role is the \
"primary person" (the form submitter). If a form has only one section or no section \
distinction, create a single role for it and mark it as primary.

2. CROSS-FILE ROLE MERGING: When the same conceptual role appears in multiple files \
(e.g. "Client" in file A and "Applicant" in file B both mean the primary form submitter), \
merge them into a single cross_file_role with a canonical label. Use semantic understanding \
— "Client", "Applicant", "Account Holder" may all be the same role. Only merge when \
confident they refer to the same type of person/entity.

3. LABEL CLEANUP: For fields with unreadable labels (numeric codes like "0021-6009", \
technical IDs like "fld_x7q", names with brackets or underscores), find the real label \
from the nearby page text. Use page text verbatim. Do not clean labels that are already \
clear readable text.

4. INTERNAL FIELD DETECTION: Identify system fields (form IDs, submission references, \
tracking codes, barcodes, buttons, submit buttons). Return their field names in \
skipped_field_names per file.

5. CONFIDENCE SCORING: For each cross_file_role where is_primary_person is true, the caller \
uses the role structure to determine confidence. Set is_primary_person accurately based on:
   - Clear primary-person keywords (Client, Applicant, Employee, Patient, Account Holder, \
Policyholder, Tenant, Borrower) → mark as primary.
   - If ambiguous (Party A/B, Person 1/2), mark the first/most prominent section as primary.
   - If only one section exists, mark it as primary.

STRICT RULES:
- Do NOT return any fill values. This is analysis only.
- Every file must have at least one detected role.
- cross_file_roles must cover ALL detected roles across all files.
- If a role only appears in one file, it still appears in cross_file_roles with one file_id.
- field_names_by_file must map each file_id to the field names belonging to that role in that file.
"""

MAX_PAGE_TEXT_CHARS = 1500


class FormAnalyserAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self.agent = Agent(
            model=runtime.smart_model,
            output_type=NativeOutput(FormAnalysisResponse),
            system_prompt=FORM_ANALYSER_SYSTEM_PROMPT,
            model_settings=runtime.smart_model_settings,
        )

    async def analyse(self, request: FormAnalysisRequest) -> FormAnalysisResponse:
        prompt = self._build_prompt(request)
        result = await self.agent.run(prompt)
        return result.output

    def _build_prompt(self, request: FormAnalysisRequest) -> str:
        sections = []
        for file_set in request.files:
            page_texts: dict[str, int] = {}
            field_page_map: dict[str, int] = {}
            for field in file_set.form_fields:
                if field.nearby_page_text:
                    text = field.nearby_page_text
                    if text not in page_texts:
                        page_texts[text] = len(page_texts)
                    field_page_map[field.name] = page_texts[text]

            page_section = "\n".join(
                f"  [Page {pid}]: {text[:MAX_PAGE_TEXT_CHARS]}" for text, pid in page_texts.items()
            )
            fields_text = "\n".join(self._format_field(f, field_page_map.get(f.name)) for f in file_set.form_fields)
            sections.append(
                f"=== FILE: {file_set.file_name} (id={file_set.file_id}) ===\n"
                f"Page texts:\n{page_section}\n\n"
                f"Fields:\n{fields_text}"
            )

        return (
            f"Analyse {len(request.files)} form(s):\n\n"
            + "\n\n".join(sections)
            + "\n\nDetect roles per file, merge matching roles across files, "
            "clean unreadable labels, identify internal/system fields."
        )

    def _format_field(self, field: FormField, page_id: int | None) -> str:
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
