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
- Skip read-only fields.
- Do NOT perform role detection — it is already done.
- Return filled_fields per file using the file_id from the request.
- If no fields match for a file, return an empty filled_fields list for that file.
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
        if field.tooltip:
            parts.append(f"  tooltip={field.tooltip}")
        if field.options:
            parts.append(f"  options={field.options}")
        if field.required:
            parts.append("  required=true")
        return "\n".join(parts)
