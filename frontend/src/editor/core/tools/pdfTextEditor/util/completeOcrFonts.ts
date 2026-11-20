import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import {
  collectContainersByPtr,
  emitTextLine,
  measureObjSpanPt,
  removeAndDestroyObject,
  removeMemberPtrs,
  rotationFromMatrix,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { loadDeviceFontInto } from "@editor/tools/pdfTextEditor/util/deviceFontEmbed";
import { familyOf } from "@editor/tools/pdfTextEditor/util/fontFamily";
import { getLocalFontBytes } from "@editor/tools/pdfTextEditor/util/localFonts";
import {
  parseTrueTypeCmap,
  primeFontGlyphMap,
} from "@editor/tools/pdfTextEditor/charcode/CmapResolver";

const OCR_RENDER_MODE = 3;
const coveredByCache = new Map<string, Map<number, number>>();

function fullFaceCovers(family: string, text: string): boolean {
  let cmap = coveredByCache.get(family);
  if (!cmap) {
    const bytes = getLocalFontBytes(family);
    if (!bytes) return false;
    const parsed = parseTrueTypeCmap(bytes);
    if (!parsed) return false;
    cmap = parsed;
    coveredByCache.set(family, parsed);
  }
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    const cp = ch.codePointAt(0);
    if (cp === undefined || !cmap.has(cp)) return false;
  }
  return true;
}

function normalise(text: string): string {
  return text.replace(/\s+/g, "");
}

/**
 * Re-emit an OCR run's invisible text in the run's full face.
 *
 * OCRmyPDF embeds only the glyphs it recognized, so the subset cannot author a
 * character the user types later. Completing the run here means every later
 * edit inherits a face that already has the document's full character set.
 * Returns true when the run was rewritten.
 */
function completeRun(doc: EditorDocument, page: Page, run: TextRun): boolean {
  if (run.renderMode !== OCR_RENDER_MODE || !run.fontSubset) return false;
  if (rotationFromMatrix(run.matrix)) return false;
  if (run.paragraphLineSlots.length > 1) return false;
  if (run.paragraphLeafPtrs.length > 0 || run.paragraphMemberPtrs.length > 0)
    return false;

  const family = familyOf(run.fontId);
  if (!family || !getLocalFontBytes(family)) return false;

  const ptrs =
    run.mergedFromPtrs.length > 0 ? run.mergedFromPtrs : [run.pdfiumObjPtr];
  const texts =
    run.mergedFromTexts.length === ptrs.length
      ? run.mergedFromTexts
      : [run.text];
  const bounds =
    run.mergedFromBounds.length === ptrs.length
      ? run.mergedFromBounds
      : [{ x: run.bounds.x, right: run.bounds.x + run.bounds.width }];
  const starts =
    run.mergedFromCharStarts.length === ptrs.length
      ? run.mergedFromCharStarts
      : [0];
  if (ptrs.some((p) => !p)) return false;
  if (texts.some((t) => !fullFaceCovers(family, t))) return false;

  const fontPtr = loadDeviceFontInto(doc, family);
  if (!fontPtr) return false;
  primeFontGlyphMap(fontPtr, doc.module);

  const slot = run.paragraphLineSlots[0];
  const baseline = slot?.baselineY ?? run.matrix.f;
  const fontSize = slot?.fontSize ?? run.fontSize;
  const newPtrs: number[] = [];
  const newTexts: string[] = [];
  const newBounds: Array<{ x: number; right: number }> = [];
  const newStarts: number[] = [];
  const touched: number[] = [];

  const abort = (): false => {
    for (const ptr of touched) {
      removeAndDestroyObject(doc.module, page.pagePtr, ptr);
    }
    return false;
  };

  for (let i = 0; i < texts.length; i++) {
    const outTexts: string[] = [];
    const emitted = emitTextLine({
      doc,
      page,
      text: texts[i],
      x: bounds[i].x,
      y: baseline,
      fontSize,
      fill: run.fill,
      originalFontPtr: 0,
      fallbackFamily: family,
      renderMode: OCR_RENDER_MODE,
      stroke: run.stroke,
      strokeWidth: run.strokeWidth,
      tagMarks: run.tagMarks,
      charSpacingPt: run.charSpacingPt,
      outTexts,
    });
    if (emitted.length === 0 || emitted.length !== outTexts.length)
      return abort();
    touched.push(...emitted);
    if (normalise(outTexts.join("")) !== normalise(texts[i])) return abort();
    let cursor = 0;
    for (let k = 0; k < emitted.length; k++) {
      const span = measureObjSpanPt(doc.module, [emitted[k]]);
      const at = texts[i].indexOf(outTexts[k], cursor);
      newPtrs.push(emitted[k]);
      newTexts.push(outTexts[k]);
      newBounds.push({
        x: span?.left ?? bounds[i].x,
        right: span?.right ?? bounds[i].right,
      });
      newStarts.push(starts[i] + (at >= 0 ? at : cursor));
      cursor = at >= 0 ? at + outTexts[k].length : cursor;
    }
  }

  removeMemberPtrs(doc.module, page, ptrs, collectContainersByPtr(run), 0);

  run.pdfiumObjPtr = newPtrs[0] ?? 0;
  run.containerPtr = 0;
  run.paragraphLeafContainers = [];
  run.paragraphMemberContainers = [];
  run.mergedFromPtrs = newPtrs;
  run.mergedFromTexts = newTexts;
  run.mergedFromBounds = newBounds;
  run.mergedFromCharStarts = newStarts;
  run.fontId = `pdf:${fontPtr}:${family}`;
  run.fontSubset = false;
  run.charPositionsKey = null;
  run.charStartsX = null;
  run.charEndsX = null;
  if (slot) {
    slot.mergedFromPtrs = newPtrs;
    slot.mergedFromTexts = newTexts;
    slot.mergedFromBounds = newBounds;
    slot.mergedFromCharStarts = newStarts;
  }

  const left = Math.min(...newBounds.map((b) => b.x));
  const right = Math.max(...newBounds.map((b) => b.right));
  run.bounds = { ...run.bounds, x: left, width: right - left };
  run.dirty = false;
  page.markNeedsGenerate();
  page.bumpRevision();
  return true;
}

/**
 * Complete every safe OCR run on the loaded pages from its family's full face.
 *
 * Runs that cannot be rewritten faithfully (rotated, multi-line, structurally
 * split, or carrying characters the full face lacks) are left untouched;
 * editing them still falls back per run.
 */
export function completeOcrFonts(doc: EditorDocument): number {
  let completed = 0;
  for (const page of doc.loadedPages()) {
    for (const run of page.runs) {
      if (completeRun(doc, page, run)) completed += 1;
    }
  }
  return completed;
}
