"""Advanced-tier document parsing via Docling.

Everything Docling is imported lazily through :mod:`importlib` so this module
imports cleanly (and pyright passes) when the addon isn't installed. Callers
must check :func:`stirling.docparse.capability.probe_capabilities` first; the
route returns 501 otherwise.
"""

from __future__ import annotations

import importlib
import io
import logging
import threading
from typing import Any

from stirling.contracts.docparse import (
    BlockType,
    DocBlock,
    DocparseTier,
    DocTable,
    ParseDocumentResponse,
)

logger = logging.getLogger(__name__)

_converter_lock = threading.Lock()
_converter: Any | None = None
_converter_key: tuple[str, bool] | None = None

# Docling DocItemLabel values → our normalized block vocabulary.
_LABEL_MAP: dict[str, BlockType] = {
    "title": BlockType.HEADING,
    "section_header": BlockType.HEADING,
    "paragraph": BlockType.PARAGRAPH,
    "text": BlockType.PARAGRAPH,
    "list_item": BlockType.LIST_ITEM,
    "table": BlockType.TABLE,
    "picture": BlockType.FIGURE,
    "chart": BlockType.FIGURE,
    "caption": BlockType.CAPTION,
    "code": BlockType.CODE,
    "formula": BlockType.FORMULA,
    "page_header": BlockType.PAGE_HEADER,
    "page_footer": BlockType.PAGE_FOOTER,
    "footnote": BlockType.FOOTNOTE,
}


def _get_converter(artifacts_path: str | None, with_ocr: bool) -> Any:
    """Build (once) and cache the Docling converter; model load costs seconds."""
    global _converter, _converter_key
    key = (artifacts_path or "", with_ocr)
    with _converter_lock:
        if _converter is not None and _converter_key == key:
            return _converter

        pdf_options_mod = importlib.import_module("docling.datamodel.pipeline_options")
        converter_mod = importlib.import_module("docling.document_converter")
        base_models = importlib.import_module("docling.datamodel.base_models")

        pipeline_options = pdf_options_mod.PdfPipelineOptions()
        pipeline_options.do_ocr = with_ocr
        pipeline_options.do_table_structure = True
        if artifacts_path:
            pipeline_options.artifacts_path = artifacts_path
            # Never reach the network when a prefetched model dir is configured.
            pipeline_options.enable_remote_services = False

        input_format = base_models.InputFormat.PDF
        pdf_format_option = converter_mod.PdfFormatOption(pipeline_options=pipeline_options)
        _converter = converter_mod.DocumentConverter(format_options={input_format: pdf_format_option})
        _converter_key = key
        return _converter


def _normalize_bbox(prov: Any, page_sizes: dict[int, tuple[float, float]]) -> tuple[int, list[float] | None]:
    """Docling prov → (page, [x0, y0, x1, y1] normalized, top-left origin)."""
    page_no = int(getattr(prov, "page_no", 1) or 1)
    bbox = getattr(prov, "bbox", None)
    size = page_sizes.get(page_no)
    if bbox is None or size is None or size[0] <= 0 or size[1] <= 0:
        return page_no, None
    width, height = size
    try:
        # Docling boxes are bottom-left origin; flip to top-left before normalizing.
        top_left = bbox.to_top_left_origin(page_height=height) if hasattr(bbox, "to_top_left_origin") else bbox
        x0 = float(top_left.l) / width
        y0 = float(top_left.t) / height
        x1 = float(top_left.r) / width
        y1 = float(top_left.b) / height
    except (AttributeError, TypeError, ValueError):
        return page_no, None
    clamp = lambda v: max(0.0, min(1.0, v))  # noqa: E731
    x0, x1 = sorted((clamp(x0), clamp(x1)))
    y0, y1 = sorted((clamp(y0), clamp(y1)))
    return page_no, [round(x0, 5), round(y0, 5), round(x1, 5), round(y1, 5)]


def _document_confidence(result: Any) -> float | None:
    """Pull a single 0..1 confidence out of Docling's confidence report, if any."""
    report = getattr(result, "confidence", None)
    if report is None:
        return None
    for attr in ("mean_score", "mean_grade_score", "score"):
        value = getattr(report, attr, None)
        if isinstance(value, (int, float)) and 0.0 <= float(value) <= 1.0:
            return round(float(value), 4)
    return None


def _table_cells(item: Any) -> list[list[str]]:
    data = getattr(item, "data", None)
    grid = getattr(data, "grid", None) or []
    cells: list[list[str]] = []
    for row in grid:
        cells.append([str(getattr(cell, "text", "") or "") for cell in row])
    return cells


def _cells_to_markdown(cells: list[list[str]]) -> str:
    if not cells:
        return ""
    esc = lambda s: s.replace("|", "\\|").replace("\n", " ")  # noqa: E731
    lines = ["| " + " | ".join(esc(c) for c in cells[0]) + " |"]
    lines.append("|" + "---|" * len(cells[0]))
    for row in cells[1:]:
        lines.append("| " + " | ".join(esc(c) for c in row) + " |")
    return "\n".join(lines)


def parse_pdf_bytes(
    data: bytes,
    file_name: str,
    *,
    with_ocr: bool = True,
    artifacts_path: str | None = None,
) -> ParseDocumentResponse:
    """Synchronous, CPU-heavy; call from a worker thread (routes use ``anyio.to_thread``)."""
    io_mod = importlib.import_module("docling_core.types.io")
    converter = _get_converter(artifacts_path, with_ocr)

    stream = io_mod.DocumentStream(name=file_name or "document.pdf", stream=io.BytesIO(data))
    try:
        result = converter.convert(stream)
    except Exception as error:
        raise ValueError(f"document could not be parsed: {error}") from error
    doc = result.document

    page_sizes: dict[int, tuple[float, float]] = {}
    for page_no, page in (getattr(doc, "pages", None) or {}).items():
        size = getattr(page, "size", None)
        if size is not None:
            page_sizes[int(page_no)] = (float(size.width), float(size.height))

    doc_confidence = _document_confidence(result)
    blocks: list[DocBlock] = []
    tables: list[DocTable] = []
    for item, _level in doc.iterate_items():
        provs = getattr(item, "prov", None) or []
        page, bbox = _normalize_bbox(provs[0], page_sizes) if provs else (1, None)
        label = str(getattr(item, "label", "") or "").lower()
        block_type = _LABEL_MAP.get(label, BlockType.OTHER)

        if block_type is BlockType.TABLE:
            cells = _table_cells(item)
            tables.append(
                DocTable(
                    page=page, bbox=bbox, cells=cells, markdown=_cells_to_markdown(cells), confidence=doc_confidence
                )
            )

        text = str(getattr(item, "text", "") or "")
        if not text and block_type not in (BlockType.TABLE, BlockType.FIGURE):
            continue
        blocks.append(DocBlock(type=block_type, text=text, page=page, bbox=bbox, confidence=doc_confidence))

    markdown = doc.export_to_markdown()
    pages = len(page_sizes) or len(getattr(doc, "pages", None) or {})
    logger.info("docparse: parsed %s: %d pages, %d blocks, %d tables", file_name, pages, len(blocks), len(tables))
    return ParseDocumentResponse(
        mode=DocparseTier.ADVANCED,
        pages=pages,
        blocks=blocks,
        tables=tables,
        markdown=markdown,
        ocr_applied=with_ocr,
    )
