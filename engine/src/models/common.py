from __future__ import annotations

from enum import StrEnum

from .base import ApiModel


class ErrorCode(StrEnum):
    """Error codes for special handling."""

    INSUFFICIENT_CREDITS = "INSUFFICIENT_CREDITS"


class Constraint(ApiModel):
    tone: str | None = None
    audience: str | None = None
    page_count: int | None = None


class UploadedFileInfo(ApiModel):
    name: str | None = None
    type: str | None = None


class PdfPreflight(ApiModel):
    file_size_mb: float | None = None
    is_encrypted: bool | None = None
    page_count: int | None = None
    has_text_layer: bool | None = None


class DraftSection(ApiModel):
    label: str
    value: str


class FieldValue(ApiModel):
    label: str
    value: str
