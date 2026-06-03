import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import { TextRun } from "@app/tools/pdfTextEditor/v2/model/TextRun";
import {
  collectContainersByPtr,
  collectMemberPtrs,
  emitTextLine,
  removeMemberPtrs,
} from "@app/tools/pdfTextEditor/v2/commands/editTextHelpers";
import { helveticaVariantFor } from "@app/tools/pdfTextEditor/v2/util/helveticaVariant";

/**
 * Swap a text run's font to one of PDFium's base-14 standard fonts.
 *
 * Implementation: remove EVERY underlying PDFium sub-object (the run's
 * primary ptr plus any per-word / per-line leaves accumulated by the
 * LineGrouper and previous overlay-path edits), then emit fresh text
 * objects in the new font - one per logical line of `run.text` so
 * paragraphs keep their per-line baselines. The model's multi-ptr
 * arrays are then reset to track the newly emitted ptrs so subsequent
 * edits can find them.
 *
 * The previous version only removed `run.pdfiumObjPtr`, leaving every
 * other sub-object (the rest of `mergedFromPtrs`, `paragraphLeafPtrs`)
 * painted by PDFium. A subsequent edit emitted new text on top, and
 * the user saw the new + stale text overlapping in the saved PDF.
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
  /** New PDFium pointers for the replacement run; needed for revert. */
  private nextPtrs: number[];
  /** Per-line baseline f-values captured at apply time for revert re-emit. */
  private prevLineFs: number[];
  /** Per-line leaf containers captured at apply for revert lookup. */
  private prevLeafPtrs: number[];
  private prevLeafContainers: number[];
  private prevMergedPtrs: number[];

  constructor(opts: { pageIndex: number; runId: string; nextFamily: string }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.nextFamily = opts.nextFamily;
    this.prevSnapshot = null;
    this.prevObjPtr = 0;
    this.nextPtrs = [];
    this.prevLineFs = [];
    this.prevLeafPtrs = [];
    this.prevLeafContainers = [];
    this.prevMergedPtrs = [];
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return;

    const m = doc.module;
    if (this.prevSnapshot === null) {
      this.prevSnapshot = run.snapshot();
      this.prevObjPtr = run.pdfiumObjPtr;
      this.prevLeafPtrs = [...run.paragraphLeafPtrs];
      this.prevLeafContainers = [...run.paragraphLeafContainers];
      this.prevMergedPtrs = [...run.mergedFromPtrs];
      // Capture per-line baselines so revert can re-emit at the right
      // y positions. Paragraphs carry these via `paragraphMemberFs`;
      // single-line runs use the rep's own matrix.f.
      this.prevLineFs =
        run.paragraphMemberFs.length > 0
          ? [...run.paragraphMemberFs]
          : [run.matrix.f];
    }

    // Remove EVERY underlying sub-object on the page so the new emit
    // doesn't overlap the leftovers.
    const memberPtrs = collectMemberPtrs(run);
    const containers = collectContainersByPtr(run);
    removeMemberPtrs(m, page, memberPtrs, containers, run.containerPtr);

    // Emit one fresh text object per logical line so paragraphs keep
    // their multi-line layout. For a single-line run with no `\n`, the
    // loop emits once. We always use the page-level NewTextObj API with
    // a base-14 family name - the font name is universal.
    const outputLines = run.text.split(/\r?\n/);
    const lineHeight =
      run.paragraphLineHeight > 0
        ? run.paragraphLineHeight
        : run.fontSize * 1.2;
    const newAnchorPtrs: number[] = [];
    const allEmittedPtrs: number[] = [];
    for (let i = 0; i < outputLines.length; i++) {
      const ptrs = emitTextLine({
        doc,
        page,
        text: outputLines[i],
        x: run.matrix.e,
        y: run.matrix.f - i * lineHeight,
        fontSize: run.fontSize,
        fill: run.fill,
        originalFontPtr: 0,
        fallbackFamily: this.nextFamily,
      });
      if (ptrs.length === 0) continue;
      newAnchorPtrs.push(ptrs[0]);
      allEmittedPtrs.push(...ptrs);
    }

    this.nextPtrs = allEmittedPtrs;

    run.pdfiumObjPtr = newAnchorPtrs[0] ?? 0;
    run.fontId = `base14:${this.nextFamily}`;
    run.fontSubset = false;
    // Reset the multi-ptr tracking arrays to mirror the fresh emit. A
    // subsequent EditTextCommand will collect these and remove them
    // cleanly instead of leaving the SetFontFamily-emitted text behind.
    run.mergedFromPtrs = [];
    run.mergedFromTexts = [];
    run.mergedFromBounds = [];
    run.mergedFromCharStarts = [];
    run.paragraphLineSlots = [];
    if (newAnchorPtrs.length > 1) {
      run.paragraphMemberPtrs = newAnchorPtrs;
      run.paragraphMemberContainers = newAnchorPtrs.map(() => 0);
      run.paragraphMemberFs = newAnchorPtrs.map(
        (_, i) => run.matrix.f - i * lineHeight,
      );
    } else {
      run.paragraphMemberPtrs = [];
      run.paragraphMemberContainers = [];
      run.paragraphMemberFs = [];
    }
    run.paragraphLeafPtrs = allEmittedPtrs;
    run.paragraphLeafContainers = allEmittedPtrs.map(() => 0);
    // Source PDFium objects are gone; the run no longer lives in a
    // form xobject after this command.
    run.containerPtr = 0;
    run.dirty = true;
    page.markDirty();
    page.markNeedsGenerate();
  }

  revert(doc: EditorDocument): void {
    if (!this.prevSnapshot) return;
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return;
    const m = doc.module;

    // Remove the apply-emitted ptrs.
    for (const ptr of this.nextPtrs) {
      if (!ptr) continue;
      try {
        m.FPDFPage_RemoveObject(page.pagePtr, ptr);
      } catch {
        /* best-effort */
      }
    }
    this.nextPtrs = [];

    // The original PDFium objects (prev fontId's text) were detached at
    // apply time. We can't recreate the exact source fonts, so re-emit
    // each pre-edit line as Helvetica-fallback chunks at the original
    // baselines. Same compromise EditTextCommand.revert makes.
    const revertFallback = helveticaVariantFor(this.prevSnapshot.fontId);
    const prevLines = this.prevSnapshot.text.split(/\r?\n/);
    const restored: number[] = [];
    const restoredAnchors: number[] = [];
    for (let i = 0; i < prevLines.length; i++) {
      const y = this.prevLineFs[i] ?? this.prevLineFs[0] ?? run.matrix.f;
      const ptrs = emitTextLine({
        doc,
        page,
        text: prevLines[i],
        x: run.matrix.e,
        y,
        fontSize: this.prevSnapshot.fontSize,
        fill: this.prevSnapshot.fill,
        originalFontPtr: 0,
        fallbackFamily: revertFallback,
      });
      if (ptrs.length > 0) {
        restoredAnchors.push(ptrs[0]);
        restored.push(...ptrs);
      }
    }

    run.pdfiumObjPtr = restoredAnchors[0] ?? this.prevObjPtr;
    run.fontId = this.prevSnapshot.fontId;
    run.fontSubset = this.prevSnapshot.fontSubset;
    run.text = this.prevSnapshot.text;
    run.fill = { ...this.prevSnapshot.fill };
    run.mergedFromPtrs = [];
    run.mergedFromTexts = [];
    run.mergedFromBounds = [];
    run.mergedFromCharStarts = [];
    run.paragraphLineSlots = [];
    if (restoredAnchors.length > 1) {
      run.paragraphMemberPtrs = restoredAnchors;
      run.paragraphMemberContainers = restoredAnchors.map(() => 0);
      run.paragraphMemberFs = this.prevLineFs.slice(0, restoredAnchors.length);
    } else {
      run.paragraphMemberPtrs = [];
      run.paragraphMemberContainers = [];
      run.paragraphMemberFs = [];
    }
    run.paragraphLeafPtrs = restored;
    run.paragraphLeafContainers = restored.map(() => 0);
    run.containerPtr = 0;
    run.dirty = true;
    page.markDirty();
    page.markNeedsGenerate();
  }
}
