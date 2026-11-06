import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { PageRect, RGBA } from "@editor/tools/pdfTextEditor/types";
import type { TagMark } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";
import {
  capturePatch,
  sampleBackground,
} from "@editor/tools/pdfTextEditor/pdfium/BackgroundSampler";
import {
  emitTextLine,
  measureObjSpanPt,
  removeAndDestroyObject,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import {
  blurRgba,
  opaqueStroke,
  placeText,
  toInkOnly,
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
const MIN_WORD_GAP = 0.15;
const MAX_SQUEEZE = 0.85;

export interface Canvas {
  doc: EditorDocument;
  page: Page;
  tagMarks: readonly TagMark[];
  created: number[];
  textPtrs: number[];
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

export function invisibleText(
  canvas: Canvas,
  text: string,
  x: number,
  baseline: number,
  fontSize: number,
  font: SearchableFont,
): number[] {
  const ptrs = emitTextLine({
    doc: canvas.doc,
    page: canvas.page,
    text,
    x,
    y: baseline,
    fontSize,
    fill: BLACK,
    originalFontPtr: font.originalFontPtr,
    fallbackFamily: font.family,
    renderMode: INVISIBLE,
    tagMarks: canvas.tagMarks,
  });
  opaqueStroke(canvas.doc.module, ptrs);
  return ptrs;
}

export function emitSearchable(
  canvas: Canvas,
  text: string,
  x: number,
  baseline: number,
  fontSize: number,
  font: SearchableFont,
): void {
  const ptrs = invisibleText(canvas, text, x, baseline, fontSize, font);
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
  const img = pasteImage(canvas, glyphs, {
    x: left,
    y: baseline - atlas.descent,
    width: width * squeezeToFit(left, left + width, limit),
    height: glyphs.height / atlas.scale,
  });
  if (!img) return false;
  emitSearchable(canvas, text, start, baseline, style.fontSize, {
    originalFontPtr: 0,
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
  replaced: { rect: PageRect; paper: RGBA } | null,
): void {
  const { doc, page } = canvas;
  const m = doc.module;
  const ptrs = placeText(doc, page, {
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
  });
  keepClear(canvas, ptrs, limit);
  const soft =
    style.softness > 0
      ? softenedCopy(canvas, ptrs, style, baseline, replaced)
      : 0;
  if (!soft) {
    canvas.created.push(...ptrs);
    canvas.textPtrs.push(...ptrs);
    return;
  }
  for (const p of ptrs) removeAndDestroyObject(m, page.pagePtr, p);
  emitSearchable(canvas, text, x, baseline, style.fontSize, {
    originalFontPtr: 0,
    family: style.family,
  });
}

function keepClear(canvas: Canvas, ptrs: number[], limit: number): void {
  if (limit === Infinity) return;
  const m = canvas.doc.module;
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
  ptrs: number[],
  style: ScanStyle,
  baseline: number,
  replaced: { rect: PageRect; paper: RGBA } | null,
): number {
  const { doc, page } = canvas;
  const m = doc.module;
  const span = measureObjSpanPt(m, ptrs);
  if (!span) return 0;
  // Just the glyphs and the blur's reach: a taller copy would also blur a
  // rule or the next line's ink sitting close above or below.
  const margin = style.softness / 4 + 0.25;
  const rect = {
    x: span.left - margin,
    y: baseline - style.fontSize * 0.25 - margin,
    width: span.right - span.left + margin * 2,
    height: style.fontSize * 1.03 + margin * 2,
  };
  if (replaced) {
    const within = replaced.rect;
    const top = Math.min(rect.y + rect.height, within.y + within.height);
    const bottom = Math.max(rect.y, within.y);
    if (top > bottom) Object.assign(rect, { y: bottom, height: top - bottom });
  }
  const patch = capturePatch(m, page, rect);
  if (!patch) return 0;
  blurRgba(patch, style.softness);
  toInkOnly(patch, replaced?.paper ?? sampleBackground(m, page, rect).fill);
  return pasteImage(canvas, patch, patch.rect);
}
