from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from stirling.models import ApiModel

from .common import ToolOperationStep


class PdfEditRequest(ApiModel):
    user_message: str
    conversation_id: str | None = None
    file_names: list[str] = Field(default_factory=list)


class EditPlanResponse(ApiModel):
    outcome: Literal["plan"] = "plan"
    summary: str
    rationale: str | None = None
    steps: list[ToolOperationStep]


class SuggestionOption(ApiModel):
    """A clickable suggestion chip shown to the user."""

    label: str = Field(description="Short display text for the chip (e.g. '90° clockwise').")
    is_other: bool = Field(
        default=False,
        description=(
            "Set to true for the 'custom input' option (e.g. 'Custom angle', 'Other format'). "
            "When true, clicking this chip focuses the text input instead of sending a message."
        ),
    )


class EditClarificationRequest(ApiModel):
    outcome: Literal["need_clarification"] = "need_clarification"
    question: str
    reason: str
    suggestions: list[SuggestionOption] = Field(
        default_factory=list,
        description=(
            "2-4 suggested answers. Include one option with is_other=true for free-form input "
            "(e.g. label='Custom angle', is_other=true). The label should describe what kind "
            "of custom input is expected, NOT just say 'Other'."
        ),
    )


class EditCannotDoResponse(ApiModel):
    outcome: Literal["cannot_do"] = "cannot_do"
    reason: str


PdfEditResponse = Annotated[
    EditPlanResponse | EditClarificationRequest | EditCannotDoResponse,
    Field(discriminator="outcome"),
]
