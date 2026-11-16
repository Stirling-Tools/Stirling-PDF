import i18n from "i18next";
import {
  needsShaping,
  needsShapingMessage,
} from "@editor/tools/pdfTextEditor/util/complexShaping";
import {
  RolledBackError,
  type Command,
} from "@editor/tools/pdfTextEditor/commands/Command";
import { drawsWhole } from "@editor/tools/pdfTextEditor/commands/bidiLineEdit";
import { refuseRedrawOfReadOnlyText } from "@editor/tools/pdfTextEditor/commands/readOnlyText";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import { writeUtf16 } from "@editor/services/pdfiumService";
import {
  fallbackFamilyFor,
  fallbackFontIdFor,
} from "@editor/tools/pdfTextEditor/util/fontCapability";
import {
  removeAndDestroyObject,
  sanitizeForBase14,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { emitDeviceFontTextObject } from "@editor/tools/pdfTextEditor/util/deviceFontEmbed";
import { nearestStandardFont } from "@editor/tools/pdfTextEditor/util/fontFamily";
import { helveticaVariantFor } from "@editor/tools/pdfTextEditor/util/helveticaVariant";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import {
  needsArabicShaping,
  shapeArabic,
} from "@editor/tools/pdfTextEditor/util/arabicShaping";
import {
  hasRtl,
  isRtlBase,
  visualOrder,
} from "@editor/tools/pdfTextEditor/util/bidi";

// Clone a text run at a fixed offset (default 12pt right + 12pt down) so the
// user can quickly stamp the same text elsewhere on the page.
const OFFSET = 12;
const CLEAR_OF_PAGE_PT = 20000;

export class DuplicateRunCommand implements Command {
  readonly type = "duplicate-run";
  private readonly pageIndex: number;
  private readonly runId: string;
  private createdRunId: string | null;
  private createdObjPtr: number;

  constructor(opts: { pageIndex: number; runId: string }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.createdRunId = null;
    this.createdObjPtr = 0;
  }

  get insertedRunId(): string | null {
    return this.createdRunId;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const src = page.findRun(this.runId);
    if (!src) return;
    refuseRedrawOfReadOnlyText(src);
    if (needsShaping(src.text))
      throw new RolledBackError(new Error(needsShapingMessage()));
    const newX = src.matrix.e + OFFSET;
    const newY = src.matrix.f - OFFSET;
    const drawn = drawCopy(doc, page, src, newX, newY);
    if (!drawn) return;
    const { ptr: newPtr, family } = drawn;
    // The copy is one object in one fallback face, which seldom holds right-to-left letters: a copy of only the line's digits and brackets is refused.
    if (hasRtl(src.text) && !copyDrawsWhole(doc, page, newPtr, src.text)) {
      removeAndDestroyObject(doc.module, page.pagePtr, newPtr);
      throw new RolledBackError(
        new Error(
          i18n.t(
            "pdfTextEditor.error.duplicateDropsLetters",
            "Can't duplicate this text: no available font draws all of its letters.",
          ),
        ),
      );
    }
    // Kept across redo: later steps that edit the copy find it by this id.
    const id =
      this.createdRunId ?? `p${page.index}-dup-${page.runs.length}-${newPtr}`;
    const clone = new TextRun({
      id,
      pageIndex: page.index,
      pdfiumObjPtr: newPtr,
      bounds: {
        x: newX,
        y: newY,
        width: src.bounds.width,
        height: src.bounds.height,
      },
      matrix: { a: 1, b: 0, c: 0, d: 1, e: newX, f: newY },
      text: src.text,
      fontId: fallbackFontIdFor(family),
      fontSize: src.fontSize,
      fill: { ...src.fill },
      fontSubset: false,
    });
    page.setRuns([...page.runs, clone]);
    page.markDirty();
    page.markNeedsGenerate();
    this.createdRunId = id;
    this.createdObjPtr = newPtr;
  }

  revert(doc: EditorDocument): void {
    if (!this.createdObjPtr || !this.createdRunId) return;
    const page = doc.page(this.pageIndex);
    doc.module.FPDFPage_RemoveObject(page.pagePtr, this.createdObjPtr);
    page.setRuns(page.runs.filter((r) => r.id !== this.createdRunId));
    page.markDirty();
    page.markNeedsGenerate();
  }
}

// Read back clear of the page: where the copy lies on the letters it copies, PDFium takes a doubled letter for one.
function copyDrawsWhole(
  doc: EditorDocument,
  page: Page,
  ptr: number,
  text: string,
): boolean {
  const m = doc.module;
  m.FPDFPageObj_Transform(ptr, 1, 0, 0, 1, 0, -CLEAR_OF_PAGE_PT);
  const whole = drawsWhole(m, page, [ptr], text);
  m.FPDFPageObj_Transform(ptr, 1, 0, 0, 1, 0, CLEAR_OF_PAGE_PT);
  return whole;
}

// A standard font is created by name; any other family has to be loaded into the document first.
function drawCopy(
  doc: EditorDocument,
  page: Page,
  src: TextRun,
  x: number,
  y: number,
): { ptr: number; family: string } | null {
  const m = doc.module;
  const size = Math.max(4, src.fontSize);
  const text = src.text.replace(/\r?\n/g, " ");
  const wanted = fallbackFamilyFor(src.fontId);
  if (nearestStandardFont(wanted) !== wanted) {
    const ptr = emitDeviceFontTextObject(
      doc,
      page,
      wanted,
      drawnLeftToRight(text),
      size,
      src.fill,
      x,
      y,
    );
    if (ptr) return { ptr, family: wanted };
  }
  const family =
    nearestStandardFont(wanted) === wanted
      ? wanted
      : helveticaVariantFor(src.fontId);
  const ptr = m.FPDFPageObj_NewTextObj(doc.docPtr, family, size);
  if (!ptr) return null;
  // Base-14 renders only WinAnsi: drop other code points rather than persist them as U+00FF tofu.
  const textPtr = writeUtf16(m, sanitizeForBase14(text));
  try {
    m.FPDFText_SetText(ptr, textPtr);
  } finally {
    m.pdfium.wasmExports.free(textPtr);
  }
  m.FPDFPageObj_SetFillColor(
    ptr,
    src.fill.r,
    src.fill.g,
    src.fill.b,
    src.fill.a,
  );
  m.FPDFPageObj_Transform(ptr, 1, 0, 0, 1, x, y);
  m.FPDFPage_InsertObject(page.pagePtr, ptr);
  return { ptr, family };
}

// Glyphs are drawn left to right in content order, so right-to-left text goes in reordered and shaped.
function drawnLeftToRight(text: string): string {
  if (!hasRtl(text)) return text;
  const shaped = needsArabicShaping(text) ? shapeArabic(text).text : text;
  return visualOrder(shaped, isRtlBase(text)).visual;
}
