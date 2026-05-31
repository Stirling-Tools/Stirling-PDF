import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import { TextRun } from "@app/tools/pdfTextEditor/v2/model/TextRun";
import { writeUtf16 } from "@app/services/pdfiumService";

/**
 * Swap a text run's font to one of PDFium's base-14 standard fonts.
 *
 * The implementation removes the existing FPDF_PAGEOBJ_TEXT and inserts
 * a fresh one with the same position, size, fill colour, and content but
 * using the requested font family. This is the PDFium-recommended path
 * for "change the font of an existing text object" because the C API
 * does not expose a SetFont accessor.
 *
 * Base-14 fonts (Helvetica, Times-Roman, Courier and their bold/italic
 * variants) are universally available without bundling - any PDF reader
 * substitutes its own glyphs. The user trades exact glyph fidelity for
 * the ability to type arbitrary Latin characters that wouldn't have been
 * in the source subset.
 */
export class SetFontFamilyCommand implements Command {
  readonly type = "set-font-family";
  private readonly pageIndex: number;
  private readonly runId: string;
  private readonly nextFamily: string;
  /** Snapshot used for revert. */
  private prevSnapshot: ReturnType<TextRun["snapshot"]> | null;
  private prevObjPtr: number;
  /** New PDFium pointer for the replacement run; needed for revert. */
  private nextObjPtr: number;

  constructor(opts: { pageIndex: number; runId: string; nextFamily: string }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.nextFamily = opts.nextFamily;
    this.prevSnapshot = null;
    this.prevObjPtr = 0;
    this.nextObjPtr = 0;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return;

    const m = doc.module;
    if (this.prevSnapshot === null) {
      this.prevSnapshot = run.snapshot();
      this.prevObjPtr = run.pdfiumObjPtr;
    }

    // Detach the original text object so the page stops painting it.
    if (run.pdfiumObjPtr) {
      m.FPDFPage_RemoveObject(page.pagePtr, run.pdfiumObjPtr);
    }

    // Create a new text object using the base-14 family name. PDFium's
    // FPDFPageObj_NewTextObj accepts these names directly.
    const newPtr = m.FPDFPageObj_NewTextObj(
      doc.docPtr,
      this.nextFamily,
      run.fontSize,
    );
    if (!newPtr) {
      // Revert the detach if creation failed.
      if (this.prevObjPtr) {
        m.FPDFPage_InsertObject(page.pagePtr, this.prevObjPtr);
      }
      return;
    }

    const textPtr = writeUtf16(m, run.text);
    try {
      m.FPDFText_SetText(newPtr, textPtr);
    } finally {
      m.pdfium.wasmExports.free(textPtr);
    }
    m.FPDFPageObj_SetFillColor(
      newPtr,
      run.fill.r,
      run.fill.g,
      run.fill.b,
      run.fill.a,
    );
    // Position the new object using the original run's matrix translation.
    m.FPDFPageObj_Transform(
      newPtr,
      run.matrix.a || 1,
      run.matrix.b || 0,
      run.matrix.c || 0,
      run.matrix.d || 1,
      run.matrix.e,
      run.matrix.f,
    );
    m.FPDFPage_InsertObject(page.pagePtr, newPtr);

    run.pdfiumObjPtr = newPtr;
    run.fontId = `base14:${this.nextFamily}`;
    run.fontSubset = false;
    run.dirty = true;
    page.markDirty();
    m.FPDFPage_GenerateContent(page.pagePtr);
    this.nextObjPtr = newPtr;
  }

  revert(doc: EditorDocument): void {
    if (!this.prevSnapshot || !this.prevObjPtr) return;
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return;
    const m = doc.module;

    if (this.nextObjPtr) {
      m.FPDFPage_RemoveObject(page.pagePtr, this.nextObjPtr);
    }
    m.FPDFPage_InsertObject(page.pagePtr, this.prevObjPtr);

    run.pdfiumObjPtr = this.prevObjPtr;
    run.fontId = this.prevSnapshot.fontId;
    run.fontSubset = this.prevSnapshot.fontSubset;
    run.text = this.prevSnapshot.text;
    run.fill = { ...this.prevSnapshot.fill };
    run.dirty = true;
    page.markDirty();
    m.FPDFPage_GenerateContent(page.pagePtr);
  }
}
