import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { PageRect, RGBA } from "@editor/tools/pdfTextEditor/types";
import type { TagMark } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";
import { uniformTags } from "@editor/tools/pdfTextEditor/model/TextTags";
import { capturePatch } from "@editor/tools/pdfTextEditor/pdfium/BackgroundSampler";
import {
  emitTextLine,
  measureObjBoundsPt,
  measureObjSpanPt,
  removeAndDestroyObject,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import {
  blurRgba,
  opaqueStroke,
  placeText,
  toInkOnly,
  type Placement,
} from "@editor/tools/pdfTextEditor/commands/scanStyle";
import type { ScanStyle } from "@editor/tools/pdfTextEditor/commands/scanFit";
import type {
  ComposedText,
  GlyphAtlas,
} from "@editor/tools/pdfTextEditor/commands/scanGlyphs";
import { transformObject } from "@editor/tools/pdfTextEditor/util/objectTransform";
import {
  createBitmapImageObject,
  type DecodedImage,
} from "@editor/utils/pdfiumBitmapUtils";

export const INVISIBLE = 3;
const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 255 };
const WHITE: RGBA = { r: 255, g: 255, b: 255, a: 255 };
const MIN_WORD_GAP = 0.15;
const MAX_SQUEEZE = 0.85;

export interface Canvas {
  doc: EditorDocument;
  page: Page;
  tagMarks: readonly TagMark[];
  created: number[];
  textPtrs: number[];
  searchableFontPtr: number;
}

export function pasteImage(
  canvas: Canvas,
  img: DecodedImage,
  rect: PageRect,
): number {
  const { doc, page } = canvas;
  const ptr = createBitmapImageObject(
    doc.module,
    doc.docPtr,
    page.pagePtr,
    img,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
  );
  if (!ptr) return 0;
  doc.module.FPDFPage_InsertObject(page.pagePtr, ptr);
  canvas.created.push(ptr);
  return ptr;
}

export interface SearchableFont {
  originalFontPtr: number;
  family: string;
}

export interface Span {
  left: number;
  right: number;
}

export function invisibleText(
  canvas: Canvas,
  text: string,
  span: Span,
  baseline: number,
  fontSize: number,
  font: SearchableFont,
): number[] {
  const m = canvas.doc.module;
  const ptrs = emitTextLine({
    doc: canvas.doc,
    page: canvas.page,
    text,
    x: span.left,
    y: baseline,
    fontSize,
    fill: BLACK,
    originalFontPtr: font.originalFontPtr,
    fallbackFamily: font.family,
    renderMode: INVISIBLE,
    tags: uniformTags(canvas.tagMarks),
  });
  opaqueStroke(m, ptrs);
  fitToSpan(m, ptrs, span);
  return ptrs;
}

function fitToSpan(
  m: EditorDocument["module"],
  ptrs: number[],
  target: Span,
): void {
  const span = measureObjSpanPt(m, ptrs);
  if (!span || span.right - span.left < 1e-3 || target.right <= target.left)
    return;
  const sx = (target.right - target.left) / (span.right - span.left);
  for (const p of ptrs)
    transformObject(m, p, sx, 0, 0, 1, target.left - sx * span.left, 0);
}

export function emitSearchable(
  canvas: Canvas,
  text: string,
  span: Span,
  baseline: number,
  fontSize: number,
  font: SearchableFont,
): void {
  const ptrs = invisibleText(canvas, text, span, baseline, fontSize, font);
  canvas.created.push(...ptrs);
  canvas.textPtrs.push(...ptrs);
}

export function squeezeToFit(
  left: number,
  right: number,
  limit: number,
): number {
  return right <= limit || limit <= left
    ? 1
    : Math.max(MAX_SQUEEZE, (limit - left) / (right - left));
}

export const wordGap = (size: number) => Math.max(1, size * MIN_WORD_GAP);

export function drawFromAtlas(
  canvas: Canvas,
  atlas: GlyphAtlas,
  glyphs: ComposedText,
  text: string,
  start: number,
  baseline: number,
  style: ScanStyle,
  limit: number,
): boolean {
  const left = start - glyphs.inkLeft / atlas.scale;
  const width = glyphs.width / atlas.scale;
  const squeeze = squeezeToFit(left, left + width, limit);
  const img = pasteImage(canvas, glyphs, {
    x: left,
    y: baseline - atlas.descent,
    width: width * squeeze,
    height: glyphs.height / atlas.scale,
  });
  if (!img) return false;
  const ink = {
    left: left + (glyphs.inkLeft / atlas.scale) * squeeze,
    right: left + (glyphs.inkRight / atlas.scale) * squeeze,
  };
  emitSearchable(canvas, text, ink, baseline, style.fontSize, {
    originalFontPtr: canvas.searchableFontPtr,
    family: style.family,
  });
  return true;
}

export function drawInFont(
  canvas: Canvas,
  text: string,
  x: number,
  inkLeft: number,
  baseline: number,
  style: ScanStyle,
  limit: number,
): void {
  const { doc, page } = canvas;
  const placement: Placement = {
    text,
    x,
    baseline,
    family: style.family,
    size: style.fontSize,
    stretch: style.stretch,
    inkLeft,
    fill: style.ink,
    weight: style.weight,
    hollow: style.hollow,
  };
  const softened =
    style.softness > 0 ? softenedCopy(canvas, placement, style, limit) : null;
  if (softened) {
    emitSearchable(canvas, text, softened, baseline, style.fontSize, {
      originalFontPtr: canvas.searchableFontPtr,
      family: style.family,
    });
    return;
  }
  const ptrs = placeText(doc, page, placement);
  keepClear(doc.module, ptrs, limit);
  canvas.created.push(...ptrs);
  canvas.textPtrs.push(...ptrs);
}

function keepClear(
  m: EditorDocument["module"],
  ptrs: number[],
  limit: number,
): void {
  if (limit === Infinity) return;
  const span = measureObjSpanPt(m, ptrs);
  if (!span) return;
  const scale = squeezeToFit(span.left, span.right, limit);
  if (scale === 1) return;
  for (const p of ptrs)
    transformObject(m, p, scale, 0, 0, 1, span.left * (1 - scale), 0);
}

// Crisp vector text on a blurry scan stands out, so blurry blocks get their
// typed words as a picture softened to match.
function softenedCopy(
  canvas: Canvas,
  placement: Placement,
  style: ScanStyle,
  limit: number,
): Span | null {
  const { doc, page } = canvas;
  const m = doc.module;
  const sheet = doc.scratchPageFor(page);
  const ptrs = placeText(sheet.doc, sheet.page, { ...placement, fill: BLACK });
  try {
    keepClear(m, ptrs, limit);
    const box = measureObjBoundsPt(m, ptrs);
    if (!box) return null;
    const margin =
      style.softness / 4 + Math.max(style.weight, style.hollow) / 2 + 0.25;
    const patch = capturePatch(m, sheet.page, {
      x: box.left - margin,
      y: box.bottom - margin,
      width: box.right - box.left + margin * 2,
      height: box.top - box.bottom + margin * 2,
    });
    if (!patch) return null;
    blurRgba(patch, style.softness);
    toInkOnly(patch, WHITE);
    for (let i = 0; i < patch.rgba.length; i += 4)
      patch.rgba.set([placement.fill.r, placement.fill.g, placement.fill.b], i);
    return pasteImage(canvas, patch, patch.rect)
      ? { left: box.left, right: box.right }
      : null;
  } finally {
    for (const p of ptrs) removeAndDestroyObject(m, sheet.page.pagePtr, p);
  }
}
