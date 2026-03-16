from __future__ import annotations

import base64
import logging
import os
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET

import models

logger = logging.getLogger(__name__)


def _safe_float(value: str | None, fallback: float = 0.0) -> float:
    """Convert an attribute value to float while handling bad input."""
    try:
        if value is None:
            return fallback
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _read_image_as_data_url(path: str) -> str | None:
    """Return a data URL for the image if it exists."""
    if not os.path.exists(path):
        return None
    mime = "image/png"
    _, ext = os.path.splitext(path)
    if ext.lower() in {".jpg", ".jpeg"}:
        mime = "image/jpeg"
    elif ext.lower() == ".gif":
        mime = "image/gif"
    try:
        with open(path, "rb") as img_handle:
            encoded = base64.b64encode(img_handle.read()).decode("ascii")
            return f"data:{mime};base64,{encoded}"
    except OSError as exc:
        logger.warning("[PDF-EDITOR] Failed to read image %s: %s", path, exc)
        return None


def _parse_fonts(root: ET.Element) -> list[models.FontElt]:
    fonts: list[models.FontElt] = []
    for spec in root.findall(".//fontspec"):
        font_id = spec.attrib.get("id")
        base_name = spec.attrib.get("family")
        size = _safe_float(spec.attrib.get("size"), 12.0)
        color = spec.attrib.get("color")
        name_lower = (base_name or "").lower()
        flags = 0
        if "bold" in name_lower:
            flags |= 0x100  # ForceBold
        if "italic" in name_lower or "oblique" in name_lower:
            flags |= 0x40  # Italic
        fonts.append(
            models.FontElt(
                id=font_id,
                uid=font_id,
                base_name=base_name,
                embedded=True,
                program=None,
                program_format=None,
                web_program=None,
                web_program_format=None,
                pdf_program=None,
                pdf_program_format=None,
                ascent=size,
                descent=-size * 0.25,
                units_per_em=max(size, 1),
                standard14_name=None,
                color=color,
                font_descriptor_flags=flags or None,
            )
        )
    return fonts


def _parse_color_components(color: str | None) -> list[float] | None:
    """Convert a hex/rgb color string into normalized RGB components."""
    if not color:
        return None

    color = color.strip()
    hex_match = re.fullmatch(r"#?([0-9a-fA-F]{6})", color)
    short_hex_match = re.fullmatch(r"#?([0-9a-fA-F]{3})", color)
    rgb_match = re.fullmatch(r"rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)", color, re.IGNORECASE)

    if hex_match:
        hex_value = hex_match.group(1)
        r = int(hex_value[0:2], 16)
        g = int(hex_value[2:4], 16)
        b = int(hex_value[4:6], 16)
        return [r / 255.0, g / 255.0, b / 255.0]

    if short_hex_match:
        hex_value = short_hex_match.group(1)
        r = int(hex_value[0] * 2, 16)
        g = int(hex_value[1] * 2, 16)
        b = int(hex_value[2] * 2, 16)
        return [r / 255.0, g / 255.0, b / 255.0]

    if rgb_match:
        r = min(max(int(rgb_match.group(1)), 0), 255)
        g = min(max(int(rgb_match.group(2)), 0), 255)
        b = min(max(int(rgb_match.group(3)), 0), 255)
        return [r / 255.0, g / 255.0, b / 255.0]

    return None


# --------------------
# Table normalization
# --------------------


def _cluster(values: list[float], tol: float) -> list[list[float]]:
    clusters: list[list[float]] = []
    for v in sorted(values):
        if not clusters or abs(v - clusters[-1][-1]) > tol:
            clusters.append([v])
        else:
            clusters[-1].append(v)
    return clusters


def _dedupe_by_xy_text(elements: list[models.TextElt], eps: float = 1.0) -> list[models.TextElt]:
    """
    Dedupe using quantized x,y and normalized text (ignores width/height jitter).
    Keeps the better scoring text; if equal text, keeps the first.
    """
    if not elements:
        return elements

    def _key(el: models.TextElt) -> tuple[int, int, str]:
        x = el.x
        y = el.y
        t = (el.text or "").strip().replace("\u00a0", " ")
        return (int(round(x / eps)), int(round(y / eps)), t)

    def _score_text_global(t: str) -> tuple[int, int, int]:
        stripped = t.strip()
        has_currency = 1 if any(sym in stripped for sym in ("$", "€", "£", "¥")) else 0
        non_space = sum(1 for ch in stripped if not ch.isspace())
        digits = sum(1 for ch in stripped if ch.isdigit())
        return (has_currency, non_space, digits)

    deduped: dict[tuple[int, int, str], models.TextElt] = {}
    for el in elements:
        key = _key(el)
        existing = deduped.get(key)
        if existing is None:
            deduped[key] = el
            continue
        t_new = key[2]
        t_old = (existing.text or "").strip().replace("\u00a0", " ")
        score_new = _score_text_global(t_new)
        score_old = _score_text_global(t_old)
        if score_new > score_old:
            deduped[key] = el
    return list(deduped.values())


def _detect_table_region(text_elements: list[models.TextElt], page_width: float) -> models.InfoElt | None:
    """
    Header-agnostic table detection via x clustering.
    Returns dict with anchors, boundaries, observed_left/right, y_min/y_max.
    """
    candidates = [
        el
        for el in text_elements
        if el.text not in (None, "")
        and isinstance(el.x, (int, float))
        and isinstance(el.y, (int, float))
        and isinstance(el.height, (int, float))
    ]
    if len(candidates) < 8:
        return None

    heights = [c.height for c in candidates if c.height]
    if not heights:
        return None
    med_h = sorted(heights)[len(heights) // 2]
    short_candidates = [c for c in candidates if c.height <= med_h * 1.8]
    if len(short_candidates) < 8:
        return None

    x_centers = [c.x + (c.width or 0) * 0.5 for c in short_candidates]
    x_clusters = _cluster(x_centers, tol=12.0)
    x_clusters = [c for c in x_clusters if len(c) >= 3]
    if len(x_clusters) < 4:
        return None

    anchors = [sum(c) / len(c) for c in x_clusters]
    anchors.sort()

    y_vals = sorted(c.y for c in short_candidates)
    y_clusters = _cluster(y_vals, tol=3.0)
    if len(y_clusters) < 3:
        return None
    y_clusters.sort(key=lambda c: len(c), reverse=True)
    y_min = min(y_clusters[0])
    y_max = max(y_clusters[0])

    min_anchor = min(anchors)
    max_anchor = max(anchors)
    pad = 12.0

    band_elems = []
    for el in short_candidates:
        cx = el.x + (el.width or 0) * 0.5
        if y_min - pad <= el.y <= y_max + pad and (min_anchor - pad) <= cx <= (max_anchor + pad):
            band_elems.append(el)
    if not band_elems:
        return None
    observed_left = min(n.x for n in band_elems)
    observed_right = max(n.x + (n.width or 0) for n in band_elems)

    raw_bounds: list[float] = []
    for i, ax in enumerate(anchors):
        if i == 0:
            gap = anchors[1] - anchors[0]
            raw_bounds.append(ax - gap * 0.5)
        else:
            raw_bounds.append((anchors[i - 1] + ax) * 0.5)
    gap_last = anchors[-1] - anchors[-2] if len(anchors) > 1 else 40.0
    raw_bounds.append(anchors[-1] + gap_last * 0.5)

    # translate boundaries to align left edge; no scaling to preserve spacing
    delta = observed_left - raw_bounds[0]
    boundaries = [b + delta for b in raw_bounds]

    info = models.InfoElt(
        anchors=anchors,
        boundaries=boundaries,
        observed_left=observed_left,
        observed_right=observed_right,
        y_min=y_min,
        y_max=y_max,
    )
    if os.environ["STIRLING_PDF_EDITOR_TABLE_DEBUG"]:
        logger.debug(
            "[PDF-EDITOR] table detected anchors=%s boundaries=%s y=(%.2f, %.2f) span=(%.2f, %.2f)",
            anchors,
            boundaries,
            y_min,
            y_max,
            observed_left,
            observed_right,
        )
    span = boundaries[-1] - boundaries[0]
    if span <= 0 or page_width <= 0:
        return None
    target_left = max(0.0, (page_width - span) * 0.5)
    offset = target_left - boundaries[0]
    info.offset = offset
    info.page_width = page_width
    return info


def _snap_table_elements(text_elements: list[models.TextElt], info: models.InfoElt) -> list[models.TextElt]:
    anchors = info.anchors
    base_boundaries = info.boundaries
    offset = info.offset or 0.0
    boundaries = [b + offset for b in base_boundaries]
    y_min = info.y_min
    y_max = info.y_max
    left = info.observed_left + offset
    right = info.observed_right + offset

    def _assign_col(cx: float) -> int:
        return min(range(len(anchors)), key=lambda i: abs(anchors[i] - cx))

    eps = 1.0
    pad = 6.0

    for el in text_elements:
        x = el.x
        w = el.width or 0
        y = el.y
        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
            continue
        cx = x + w * 0.5 + offset
        if not (left - pad <= cx <= right + pad and y_min - pad <= y <= y_max + pad):
            continue

        col = _assign_col(cx - offset)
        col_left = boundaries[col]
        col_right = boundaries[col + 1]

        new_left = x + offset
        new_right = x + w + offset
        if new_left < col_left - eps:
            new_left = col_left
        if new_right > col_right + eps:
            new_right = col_right
        if new_right <= new_left:
            mid = (col_left + col_right) * 0.5
            new_left = mid - 0.5
            new_right = mid + 0.5

        el.x = new_left
        el.width = max(1.0, new_right - new_left)
        el.text_matrix = [1, 0, 0, 1, el.x, el.y]

    return text_elements


def _parse_page(page_elem: ET.Element, base_dir: str, font_colors: dict[str | None, str | None]) -> models.PageElt:
    page_width = _safe_float(page_elem.attrib.get("width"), 612.0)
    page_height = _safe_float(page_elem.attrib.get("height"), 792.0)
    text_elements: list[models.TextElt] = []
    image_elements: list[models.ImageElt] = []

    # Cluster near-identical text draws on the same baseline and keep the best candidate.
    eps = 1.0
    best_by_pos: dict[tuple[int, int], models.TextElt] = {}

    def _q(value: float) -> int:
        return round(value / eps)

    def _score_text(t: str) -> tuple[int, int, int]:
        stripped = t.strip()
        has_currency = 1 if any(sym in stripped for sym in ("$", "€", "£", "¥")) else 0
        non_space = sum(1 for ch in stripped if not ch.isspace())
        digits = sum(1 for ch in stripped if ch.isdigit())
        return (has_currency, non_space, digits)

    for index, text_elem in enumerate(page_elem.findall("text")):
        raw_text = "".join(text_elem.itertext()).replace("\u00a0", " ")
        text = raw_text.strip("\n")
        left = _safe_float(text_elem.attrib.get("left"))
        top = _safe_float(text_elem.attrib.get("top"))
        width = _safe_float(text_elem.attrib.get("width"))
        height = _safe_float(text_elem.attrib.get("height"))
        font_id = text_elem.attrib.get("font")
        font_color = font_colors.get(font_id) if font_id else None
        fill_components = _parse_color_components(font_color)

        candidate = models.TextElt(
            id=f"t-{index}",
            text=text,
            font_id=font_id,
            font_size=height if height > 0 else None,
            x=left,
            y=page_height - top,
            width=width,
            height=height,
            text_matrix=[1, 0, 0, 1, left, page_height - top],
            fill_color=models.Color(color_space="RGB", components=fill_components) if fill_components else None,
        )

        pos_key = (_q(left), _q(page_height - top))

        existing = best_by_pos.get(pos_key)
        if existing is None:
            best_by_pos[pos_key] = candidate
        else:
            if _score_text(candidate.text) > _score_text(existing.text):
                best_by_pos[pos_key] = candidate

    # Optional merge of adjacent runs on the same baseline (e.g., "$" + "38.00")
    merged: list[models.TextElt] = []
    base_elements = _dedupe_by_xy_text(sorted(best_by_pos.values(), key=lambda i: (i.y, i.x)), eps=1.0)
    # Sort by baseline (y) then x to make merges stable and ordering deterministic
    for item in sorted(base_elements, key=lambda i: (i.y, i.x)):
        if not merged:
            merged.append(item)
            continue
        prev = merged[-1]
        same_line = _q(prev.y) == _q(item.y)
        if not same_line:
            merged.append(item)
            continue
        prev_right = prev.x + (prev.width or 0)
        gap = item.x - prev_right
        max_h = max(prev.height or 0, item.height or 0)
        allowed_gap = max(2.0, 0.25 * max_h)
        if gap <= allowed_gap and gap >= -allowed_gap:
            # Merge
            needs_space = (
                prev.text.strip() != ""
                and item.text.strip() != ""
                and not prev.text.endswith(" ")
                and not item.text.startswith(" ")
                and not prev.text.rstrip().endswith(("$", "€", "£", "¥"))
            )
            merged_text = prev.text + (" " if needs_space else "") + item.text
            new_left = min(prev.x, item.x)
            new_right = max(prev_right, item.x + (item.width or 0))
            prev.text = merged_text
            prev.x = new_left
            prev.width = new_right - new_left
            prev.height = max_h
        else:
            merged.append(item)

    # Phase A: dedupe by xy+text to remove duplicate draws
    deduped = _dedupe_by_xy_text(merged, eps=1.0)

    # Phase B: table detection + snapping (header-agnostic)
    table_info = _detect_table_region(deduped, page_width)
    if table_info:
        snapped = _snap_table_elements(deduped, table_info)
        text_elements = _dedupe_by_xy_text(snapped, eps=1.0)
    else:
        text_elements = deduped

    for img_index, image_elem in enumerate(page_elem.findall("image")):
        left = _safe_float(image_elem.attrib.get("left"))
        top = _safe_float(image_elem.attrib.get("top"))
        width = _safe_float(image_elem.attrib.get("width"))
        height = _safe_float(image_elem.attrib.get("height"))
        src = image_elem.attrib.get("src")
        image_path = os.path.join(base_dir, src) if src else None
        data_url = _read_image_as_data_url(image_path) if image_path else None
        image_elements.append(
            models.ImageElt(
                id=src or f"image-{img_index}",
                object_name=src,
                x=left,
                y=max(page_height - top - height, 0),
                width=width,
                height=height,
                left=left,
                top=top,
                bottom=max(page_height - top, 0),
                right=left + width,
                image_data=data_url,
                image_format=os.path.splitext(src)[1][1:] if src else None,
            )
        )

    return models.PageElt(
        width=page_width,
        height=page_height,
        page_number=_safe_float(page_elem.attrib.get("number"), 0),
        text_elements=text_elements,
        image_elements=image_elements,
    )


def convert_pdf_to_text_editor_document(pdf_path: str) -> models.Document:
    """Convert a PDF to a JSON payload usable by the PDF text editor."""
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(pdf_path)

    with tempfile.TemporaryDirectory() as tmpdir:
        output_base = os.path.join(tmpdir, "doc")
        command = [
            "pdftohtml",
            "-xml",
            "-enc",
            "UTF-8",
            "-nodrm",
            "-q",
            pdf_path,
            output_base,
        ]
        try:
            subprocess.run(command, check=True, capture_output=True)
        except (FileNotFoundError, subprocess.CalledProcessError) as exc:
            logger.error("[PDF-EDITOR] pdftohtml failed for %s: %s", pdf_path, exc)
            raise

        xml_path = f"{output_base}.xml"
        if not os.path.exists(xml_path):
            raise FileNotFoundError(xml_path)

        tree = ET.parse(xml_path)
        root = tree.getroot()

        fonts = _parse_fonts(root)
        font_colors: dict[str | None, str | None] = {font.id: font.color for font in fonts if font.id}
        pages = [_parse_page(page_elem, tmpdir, font_colors) for page_elem in root.findall("page")]

        document = models.DocumentElt(
            metadata=models.Metadata(number_of_pages=len(pages)),
            fonts=fonts,
            pages=pages,
            lazy_images=False,
        )
        return models.Document(document=document)


__all__ = ["convert_pdf_to_text_editor_document"]
