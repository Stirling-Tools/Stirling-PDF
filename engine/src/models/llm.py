from __future__ import annotations

from .base import ApiModel


class LLMGeneratedSection(ApiModel):
    index: int
    value: str


class LLMGenerateAllSectionsResponse(ApiModel):
    sections: list[LLMGeneratedSection]
