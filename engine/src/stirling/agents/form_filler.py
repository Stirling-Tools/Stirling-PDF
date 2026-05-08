from __future__ import annotations

from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.contracts import format_conversation_history
from stirling.contracts.form_fill import (
    FormField,
    FormFillBatchRequest,
    FormFillBatchResponse,
)
from stirling.services import AppRuntime

FORM_FILLER_SYSTEM_PROMPT = """\
You are a PDF form filler. You receive form fields and a knowledge dictionary of \
confirmed user information. Role detection has already been done — all fields given \
to you belong to the user's section.

Your job: Match form fields to knowledge entries and return fill values.

STRICT RULES:
- ONLY fill a field if a knowledge entry is clearly the same information.
- For checkbox fields: value must be "Yes" or "Off".
- For radio/combobox/listbox fields: value MUST be one of the field's options.
- For multiline fields, you may emit multi-line values (e.g. addresses).
- For multi_select fields, the value should be a comma-separated list of options.
- Do NOT perform role detection — it is already done.
- Return filled_fields per file using the file_id from the request.
- If no fields match for a file, return an empty filled_fields list for that file.

MULTI-ENTITY KNOWLEDGE PREFERENCE:
When the dictionary has BOTH a plain key (e.g. `first_name`) and a role-prefixed \
version (e.g. `client_first_name`), the role-prefixed key is authoritative for \
this file's role_label — prefer it. The plain key is a shared/fallback value used \
when the role-prefixed version is missing.

NEARBY PAGE TEXT:
A field's `nearby_page_text` snippet is the literal text surrounding the field on \
the page. Use it to disambiguate generic labels — e.g. a field labelled "Date" with \
"Contract effective date:" in its nearby text wants `start_date`, not \
`date_of_birth`.

EXISTING VALUE:
A field's `value=` shows what's already filled in. If the existing value already \
matches the right knowledge entry, you may still emit it (the caller decides \
whether to apply). Do NOT overwrite a non-empty existing value with a stale guess.
"""


class FormFillerAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self.agent = Agent(
            model=runtime.fast_model,
            output_type=NativeOutput(FormFillBatchResponse),
            system_prompt=FORM_FILLER_SYSTEM_PROMPT,
            model_settings=runtime.fast_model_settings,
        )

    async def fill_batch(self, request: FormFillBatchRequest) -> FormFillBatchResponse:
        prompt = self._build_prompt(request)
        result = await self.agent.run(prompt)
        return result.output

    def _build_prompt(self, request: FormFillBatchRequest) -> str:
        knowledge_text = (
            "\n".join(f"- {k}: {v}" for k, v in request.knowledge.items() if not k.startswith("_"))
            or "No knowledge entries."
        )

        file_sections = []
        for file_req in request.files:
            fields_text = "\n".join(self._format_field(f) for f in file_req.form_fields)
            file_sections.append(f"=== FILE {file_req.file_id} (role: {file_req.role_label}) ===\n{fields_text}")

        history = format_conversation_history(request.conversation_history)
        return (
            f"Conversation history:\n{history}\n\n"
            f"Known user information:\n{knowledge_text}\n\n"
            + "\n\n".join(file_sections)
            + "\n\nMatch fields to knowledge entries. Return filled_fields per file."
        )

    def _format_field(self, field: FormField) -> str:
        parts = [f"- name={field.name}, type={field.type}"]
        if field.label:
            parts.append(f"  label={field.label}")
        if field.value:
            parts.append(f"  value={field.value}")
        if field.tooltip:
            parts.append(f"  tooltip={field.tooltip}")
        if field.options:
            parts.append(f"  options={field.options}")
        if field.required:
            parts.append("  required=true")
        if field.multiline:
            parts.append("  multiline=true")
        if field.multi_select:
            parts.append("  multi_select=true")
        if field.nearby_page_text:
            parts.append(f"  nearby_page_text={field.nearby_page_text}")
        return "\n".join(parts)
