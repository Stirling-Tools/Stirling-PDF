from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from .base import ApiModel


class ThemePayload(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        extra="allow",  # CSS var overrides (--theme-primary etc.) are dynamic
        validate_by_name=True,
        validate_by_alias=True,
    )
    logo_base64: str | None = None

    def css_overrides(self) -> dict[str, str] | None:
        extras = self.model_extra or {}
        return {k: str(v) for k, v in extras.items()} if extras else None


class CreateStreamPhase(StrEnum):
    OUTLINE = "outline"
    DRAFT = "draft"
    POLISH = "polish"
    REVISE = "revise"


class CreateStreamRequest(ApiModel):
    phase: CreateStreamPhase = CreateStreamPhase.OUTLINE
    theme: ThemePayload | None = None  # theme dict sent in POST body
    additional_instructions: str = ""

    # Optional HTML revision inputs (used when phase=REVISE).
    base_html: str | None = None


class PreviewTemplateHtmlRequest(ApiModel):
    template: str = ""


class RenderPreviewRequest(ApiModel):
    template: str = ""
    theme: ThemePayload | None = None
