from __future__ import annotations

from .base import ApiModel


class Color(ApiModel):
    color_space: str
    components: list[float]


class TextElt(ApiModel):
    id: str
    text: str
    font_id: str | None = None
    font_size: float | None = None
    x: float
    y: float
    width: float
    height: float
    text_matrix: list[float]
    fill_color: Color | None = None


class ImageElt(ApiModel):
    id: str
    object_name: str | None = None
    x: float
    y: float
    width: float
    height: float
    left: float
    top: float
    bottom: float
    right: float
    image_data: str | None = None
    image_format: str | None = None


class InfoElt(ApiModel):
    anchors: list[float]
    boundaries: list[float]
    observed_left: float
    observed_right: float
    y_min: float
    y_max: float
    offset: float = 0.0
    page_width: float | None = None


class PageElt(ApiModel):
    width: float
    height: float
    page_number: float
    text_elements: list[TextElt]
    image_elements: list[ImageElt]


class Metadata(ApiModel):
    number_of_pages: int


class FontElt(ApiModel):
    id: str | None
    uid: str | None
    base_name: str | None = None
    embedded: bool
    program: None
    program_format: None = None
    web_program: None = None
    web_program_format: None = None
    pdf_program: None = None
    pdf_program_format: None = None
    ascent: float
    descent: float
    units_per_em: float
    standard14_name: None = None
    color: str | None
    font_descriptor_flags: int | None = None


class DocumentElt(ApiModel):
    metadata: Metadata
    fonts: list[FontElt]
    pages: list[PageElt]
    lazy_images: bool


class Document(ApiModel):
    document: DocumentElt
