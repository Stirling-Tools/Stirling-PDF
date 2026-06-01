import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import { TextRun } from "@app/tools/pdfTextEditor/v2/model/TextRun";
import { writeUtf16 } from "@app/services/pdfiumService";
import {
  collectContainersByPtr,
  collectMemberPtrs,
  removeMemberPtrs,
} from "@app/tools/pdfTextEditor/v2/commands/editTextHelpers";

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
 *
 * For LineGrouper-merged runs (per-glyph originals collapsed into one
 * editable line) and paragraph runs (multiple sub-lines merged), we
 * remove EVERY member pointer - not just the run's primary. Removing
 * only `run.pdfiumObjPtr` leaves the other per-glyph objects on the
 * page, and the new Helvetica-Bold emit lands ON TOP of them - the
 * visible "multiple layers" / "broken text" bug the user reported when
 * hitting Bold on a tagline whose source PDF used per-character text
 * objects (the marketing tagline in user-sample.pdf is exactly this).
 */
export class SetFontFamilyCommand implements Command {
  readonly type = "set-font-family";
  private readonly pageIndex: number;
  private readonly runId: string;
  private readonly nextFamily: string;
  /** Snapshot used for revert. */
  private prevSnapshot: ReturnType<TextRun["snapshot"]> | null;
  private prevObjPtr: number;
  /**
   * Every member ptr that was on the page at apply time (paragraph
   * leaves, merged sub-runs, or just the primary). Revert re-inserts
   * each one in original order to restore the source per-glyph layout.
   */
  private prevMemberPtrs: number[];
  /** Snapshot of merged-from arrays so revert can rebuild the model. */
  private prevMergedFromPtrs: number[];
  private prevMergedFromTexts: string[];
  private prevMergedFromBounds: Array<{ x: number; right: number }>;
  private prevMergedFromCharStarts: number[];
  /** New PDFium pointer for the replacement run; needed for revert. */
  private nextObjPtr: number;

  constructor(opts: { pageIndex: number; runId: string; nextFamily: string }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.nextFamily = opts.nextFamily;
    this.prevSnapshot = null;
    this.prevObjPtr = 0;
    this.prevMemberPtrs = [];
    this.prevMergedFromPtrs = [];
    this.prevMergedFromTexts = [];
    this.prevMergedFromBounds = [];
    this.prevMergedFromCharStarts = [];
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
      this.prevMemberPtrs = collectMemberPtrs(run).slice();
      this.prevMergedFromPtrs = [...run.mergedFromPtrs];
      this.prevMergedFromTexts = [...run.mergedFromTexts];
      this.prevMergedFromBounds = run.mergedFromBounds.map((b) => ({ ...b }));
      this.prevMergedFromCharStarts = [...run.mergedFromCharStarts];
    }

    // Detach EVERY member object so the page stops painting them. For
    // a singleton run this is just `run.pdfiumObjPtr`; for a merged or
    // paragraph run this is all 30+ per-glyph originals. Skipping the
    // members produced the "multiple layers" overlap bug.
    const containers = collectContainersByPtr(run);
    removeMemberPtrs(
      m,
      page,
      this.prevMemberPtrs,
      containers,
      run.containerPtr,
    );
    // Also clear the model arrays - the run is about to become a single
    // base-14 text object so the merged-from bookkeeping is stale.
    run.mergedFromPtrs = [];
    run.mergedFromTexts = [];
    run.mergedFromBounds = [];
    run.mergedFromCharStarts = [];

    // Create a new text object using the base-14 family name. PDFium's
    // FPDFPageObj_NewTextObj accepts these names directly.
    const newPtr = m.FPDFPageObj_NewTextObj(
      doc.docPtr,
      this.nextFamily,
      run.fontSize,
    );
    if (!newPtr) {
      // Re-insert every detached member so the page goes back to its
      // pre-command state, not just the primary ptr.
      for (const ptr of this.prevMemberPtrs) {
        if (!ptr) continue;
        try {
          m.FPDFPage_InsertObject(page.pagePtr, ptr);
        } catch {
          /* best-effort */
        }
      }
      run.mergedFromPtrs = [...this.prevMergedFromPtrs];
      run.mergedFromTexts = [...this.prevMergedFromTexts];
      run.mergedFromBounds = this.prevMergedFromBounds.map((b) => ({ ...b }));
      run.mergedFromCharStarts = [...this.prevMergedFromCharStarts];
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
    // Re-insert every detached original (the primary AND any merged
    // sub-objects / paragraph leaves) so the source per-glyph layout
    // comes back, not just the singleton primary.
    for (const ptr of this.prevMemberPtrs) {
      if (!ptr) continue;
      try {
        m.FPDFPage_InsertObject(page.pagePtr, ptr);
      } catch {
        /* best-effort */
      }
    }

    run.pdfiumObjPtr = this.prevObjPtr;
    run.fontId = this.prevSnapshot.fontId;
    run.fontSubset = this.prevSnapshot.fontSubset;
    run.text = this.prevSnapshot.text;
    run.fill = { ...this.prevSnapshot.fill };
    run.mergedFromPtrs = [...this.prevMergedFromPtrs];
    run.mergedFromTexts = [...this.prevMergedFromTexts];
    run.mergedFromBounds = this.prevMergedFromBounds.map((b) => ({ ...b }));
    run.mergedFromCharStarts = [...this.prevMergedFromCharStarts];
    run.dirty = true;
    page.markDirty();
    m.FPDFPage_GenerateContent(page.pagePtr);
  }
}
