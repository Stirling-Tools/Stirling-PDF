from __future__ import annotations

from pydantic import Field

from stirling.models import ApiModel


class Page(ApiModel):
    """A single page of a document, retrieved from full-text storage.

    ``char_count`` is precomputed at ingest time and reported here so callers
    can budget how much content they want to read without first concatenating
    the text of every page.
    """

    page_number: int = Field(ge=1)
    text: str
    char_count: int = Field(ge=0)


class PageRange(ApiModel):
    """Inclusive page range for partial reads. Both bounds are 1-indexed."""

    start: int = Field(ge=1)
    end: int = Field(ge=1)
