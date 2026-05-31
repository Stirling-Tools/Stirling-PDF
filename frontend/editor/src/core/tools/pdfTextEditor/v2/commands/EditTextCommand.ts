import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import { PdfiumTextWriter } from "@app/tools/pdfTextEditor/v2/pdfium/PdfiumTextWriter";
import { sampleBackground } from "@app/tools/pdfTextEditor/v2/pdfium/BackgroundSampler";
import {
  collectContainersByPtr,
  collectMemberPtrs,
  emitFillRect,
  emitTextLine,
  everyCharIn,
  removeMemberPtrs,
} from "@app/tools/pdfTextEditor/v2/commands/editTextHelpers";
import {
  applyPartialEditPlan,
  planPartialEdit,
  type PartialEditPlan,
} from "@app/tools/pdfTextEditor/v2/commands/partialEdit";
import { helveticaVariantFor } from "@app/tools/pdfTextEditor/v2/util/helveticaVariant";

interface RevertLine {
  text: string;
  x: number;
  y: number;
  fill: { r: number; g: number; b: number; a: number };
  fontSize: number;
}

/**
 * Edit a text run.
 *
 * Two paths: plain in-place SetText (singleton base-14), and
 * collapse-and-overlay. The overlay path paints a cover rect over the
 * original bounds (because PDFium can't remove text from inside a form
 * xobject) and stacks fresh page-level text objects on top.
 *
 * The replacement keeps the original font when every new character was
 * already present in the source string AND the source is neither a
 * subset font nor nested in a form xobject; otherwise it falls back to
 * base-14 Helvetica so the user always sees real glyphs.
 */
export class EditTextCommand implements Command {
  readonly type = "edit-text";
  private readonly pageIndex: number;
  private readonly runId: string;
  private readonly nextText: string;
  private prevText: string | null = null;

  private overlaid = false;
  private prevObjPtr = 0;
  private prevFontId: string | null = null;
  private coverRectPtr = 0;
  private createdPtrs: number[] = [];
  private newTextPtr = 0;
  private revertLines: RevertLine[] = [];
  private revertCreatedPtrs: number[] = [];
  /** Set when the apply path took the partial-edit (LCS) shortcut. */
  private partialPlan: PartialEditPlan | null = null;
  private partialInsertedPtrs: number[] = [];
  private prevMergedFromPtrs: number[] = [];
  private prevMergedFromTexts: string[] = [];
  private prevMergedFromBounds: Array<{ x: number; right: number }> = [];

  constructor(opts: { pageIndex: number; runId: string; nextText: string }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.nextText = opts.nextText;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return;
    if (this.prevText === null) this.prevText = run.text;

    const alreadyBase14 = /^base14:/.test(run.fontId);

    // SURGICAL DIFF PATH (try first, before any other branch):
    // LCS the prev and next text against the per-sub-object layout so
    // every surviving char keeps its ORIGINAL font, byte code, and
    // glyph. Only the chars the user actually inserted are emitted in
    // a Helvetica fallback. Sub-objects whose chars were all deleted
    // get removed; everything else is shifted to fit. Bails out only
    // for mixed-survival sub-objects (would need splitting).
    if (this.partialPlan === null && run.mergedFromPtrs.length > 0) {
      const partial = planPartialEdit(run, this.prevText ?? "", this.nextText);
      if (partial) {
        this.partialPlan = partial;
        this.prevMergedFromPtrs = [...run.mergedFromPtrs];
        this.prevMergedFromTexts = [...run.mergedFromTexts];
        this.prevMergedFromBounds = run.mergedFromBounds.map((b) => ({ ...b }));
        const result = applyPartialEditPlan(doc, page, run, partial);
        this.partialInsertedPtrs = result.insertedPtrs;
        run.mergedFromPtrs = result.newMergedFromPtrs;
        run.mergedFromTexts = result.newMergedFromTexts;
        run.mergedFromBounds = result.newMergedFromBounds;
        run.bounds = {
          ...run.bounds,
          x: result.newBoundsX,
          width: result.newBoundsWidth,
        };
        if (result.newMergedFromPtrs.length > 0) {
          run.pdfiumObjPtr = result.newMergedFromPtrs[0];
        }
        run.text = this.nextText;
        run.dirty = true;
        page.markDirty();
        return;
      }
    }

    // Force overlay whenever the in-place SetText path can't keep every
    // PDFium object up to date:
    //   - paragraphs (multiple line objects) or newline-containing text
    //   - text with consecutive spaces (per-word emit produced extra
    //     ptrs in `paragraphLeafPtrs`; an in-place SetText would only
    //     update the first chunk and leave the rest stale)
    //   - any run that has more than one leaf ptr in the model (e.g.
    //     because a previous edit went through per-word emit)
    const needsMultiObjectEmit =
      run.paragraphMemberPtrs.length > 1 ||
      run.paragraphLeafPtrs.length > 1 ||
      /\r?\n/.test(this.nextText) ||
      /\s\s/.test(this.nextText);
    const needsOverlay =
      needsMultiObjectEmit ||
      (!this.overlaid &&
        !alreadyBase14 &&
        (run.mergedFromPtrs.length > 0 ||
          run.fontSubset ||
          run.pdfiumObjPtr !== 0));

    if (!needsOverlay) {
      run.text = this.nextText;
      run.dirty = true;
      page.markDirty();
      PdfiumTextWriter.commitRunText(doc, page, run);
      return;
    }

    this.overlaid = true;
    this.prevObjPtr = run.pdfiumObjPtr;
    if (this.prevFontId === null) this.prevFontId = run.fontId;
    const fallbackFamily = helveticaVariantFor(this.prevFontId);
    const m = doc.module;

    const bg = sampleBackground(m, page, run.bounds);
    const safeChars = everyCharIn(this.nextText, this.prevText ?? "");
    // Reusing the source font is only safe when the font handles its own
    // Unicode-to-glyph mapping correctly. Subset / CID fonts famously
    // don't, but neither do non-standard embedded fonts with custom
    // encodings - calling FPDFText_SetText on a borrowed handle to one
    // of those returns garbage glyphs (e.g. ÿ for every char that isn't
    // already in the original string in the same slot). Only trust
    // fontIds we know are base-14 (the safe set).
    const looksBase14 = /^base14:/.test(run.fontId);
    const canReuseFont =
      looksBase14 && safeChars && !run.fontSubset && run.containerPtr === 0;
    const originalFontPtr =
      canReuseFont && run.pdfiumObjPtr ? safeGetFont(m, run.pdfiumObjPtr) : 0;

    this.revertLines = snapshotRevertLines(run, this.prevText ?? "");

    const memberPtrs = collectMemberPtrs(run);
    const containers = collectContainersByPtr(run);
    const allRemoved = removeMemberPtrs(
      m,
      page,
      memberPtrs,
      containers,
      run.containerPtr,
    );

    if (!allRemoved) {
      this.coverRectPtr = emitFillRect(m, page, run.bounds, bg.fill);
      if (this.coverRectPtr) this.createdPtrs.push(this.coverRectPtr);
    }

    const outputLines = this.nextText.split(/\r?\n/);
    const lineHeight =
      run.paragraphLineHeight > 0
        ? run.paragraphLineHeight
        : run.fontSize * 1.2;
    // One "line anchor" ptr per output line (first ptr emitted for that
    // line); plus any extra per-word ptrs from space preservation, kept
    // for leaf removal on subsequent edits.
    const lineAnchorPtrs: number[] = [];
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
        originalFontPtr,
        fallbackFamily,
      });
      if (ptrs.length === 0) continue;
      this.createdPtrs.push(...ptrs);
      allEmittedPtrs.push(...ptrs);
      lineAnchorPtrs.push(ptrs[0]);
    }

    if (lineAnchorPtrs.length > 0) {
      this.newTextPtr = lineAnchorPtrs[0];
      run.pdfiumObjPtr = lineAnchorPtrs[0];
      if (originalFontPtr === 0) {
        run.fontId = `base14:${fallbackFamily}`;
        run.fontSubset = false;
      }
      run.paragraphMemberPtrs = lineAnchorPtrs;
      run.paragraphMemberContainers = lineAnchorPtrs.map(() => 0);
      run.paragraphMemberFs = lineAnchorPtrs.map(
        (_, i) => run.matrix.f - i * lineHeight,
      );
      // Every per-word emit becomes a leaf - so the next edit's removal
      // pass cleans them up alongside the anchors.
      run.paragraphLeafPtrs = allEmittedPtrs;
      run.paragraphLeafContainers = allEmittedPtrs.map(() => 0);
    }

    run.mergedFromPtrs = [];
    // Don't reset paragraphLeafPtrs here - we just set them above to the
    // freshly-emitted chunks so the next overlay edit can remove them.
    run.text = this.nextText;
    run.dirty = true;
    page.markDirty();
    m.FPDFPage_GenerateContent(page.pagePtr);
  }

  revert(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run || this.prevText === null) return;
    const m = doc.module;

    // Partial-edit fast path revert: the removed sub-objects are gone
    // from PDFium permanently, so we re-emit Helvetica fallback chunks
    // at their original positions to give the user back the visible
    // chars (in a different font). Inserted Helvetica chunks from the
    // forward apply are removed.
    if (this.partialPlan) {
      for (const ptr of this.partialInsertedPtrs) {
        if (!ptr) continue;
        try {
          m.FPDFPage_RemoveObject(page.pagePtr, ptr);
        } catch {
          /* best-effort */
        }
      }
      this.partialInsertedPtrs = [];
      run.mergedFromPtrs = this.prevMergedFromPtrs;
      run.mergedFromTexts = this.prevMergedFromTexts;
      run.mergedFromBounds = this.prevMergedFromBounds.map((b) => ({ ...b }));
      const revertFallback = helveticaVariantFor(this.prevFontId ?? run.fontId);
      const restored: number[] = [];
      for (const { ptr } of this.partialPlan.removePtrs) {
        const origIdx = this.prevMergedFromPtrs.indexOf(ptr);
        if (origIdx < 0) continue;
        const text = this.prevMergedFromTexts[origIdx] ?? "";
        const bounds = this.prevMergedFromBounds[origIdx];
        if (!text || !bounds) continue;
        const ptrs = emitTextLine({
          doc,
          page,
          text,
          x: bounds.x,
          y: run.matrix.f,
          fontSize: run.fontSize,
          fill: run.fill,
          originalFontPtr: 0,
          fallbackFamily: revertFallback,
        });
        restored.push(...ptrs);
      }
      this.revertCreatedPtrs = restored;
      run.text = this.prevText;
      run.dirty = true;
      this.partialPlan = null;
      page.markDirty();
      m.FPDFPage_GenerateContent(page.pagePtr);
      return;
    }

    if (!this.overlaid) {
      run.text = this.prevText;
      run.dirty = true;
      page.markDirty();
      PdfiumTextWriter.commitRunText(doc, page, run);
      return;
    }

    for (const ptr of this.createdPtrs) {
      if (!ptr) continue;
      try {
        m.FPDFPage_RemoveObject(page.pagePtr, ptr);
      } catch {
        /* best-effort */
      }
    }
    this.coverRectPtr = 0;
    this.newTextPtr = 0;
    this.createdPtrs = [];

    // PDFium has no insert-into-form-xobject API, so the truly-original
    // pointers (if they lived in a form) are gone forever. Re-emit a
    // visually-equivalent paragraph at page level using the snapshot
    // captured during apply.
    const revertFallback = helveticaVariantFor(this.prevFontId ?? "");
    const lineAnchorPtrs: number[] = [];
    const allRestoredPtrs: number[] = [];
    for (const line of this.revertLines) {
      const ptrs = emitTextLine({
        doc,
        page,
        text: line.text,
        x: line.x,
        y: line.y,
        fontSize: line.fontSize,
        fill: line.fill,
        originalFontPtr: 0,
        fallbackFamily: revertFallback,
      });
      if (ptrs.length === 0) continue;
      lineAnchorPtrs.push(ptrs[0]);
      allRestoredPtrs.push(...ptrs);
    }
    this.revertCreatedPtrs = allRestoredPtrs;

    run.pdfiumObjPtr = lineAnchorPtrs[0] ?? this.prevObjPtr;
    run.fontId = `base14:${revertFallback}`;
    run.fontSubset = false;
    run.text = this.prevText;
    run.mergedFromPtrs = [];
    run.paragraphMemberPtrs = lineAnchorPtrs;
    run.paragraphMemberContainers = lineAnchorPtrs.map(() => 0);
    run.paragraphMemberFs = this.revertLines.map((l) => l.y);
    run.paragraphLeafPtrs = allRestoredPtrs;
    run.paragraphLeafContainers = allRestoredPtrs.map(() => 0);
    run.containerPtr = 0;
    run.dirty = true;
    this.overlaid = false;
    page.markDirty();
    m.FPDFPage_GenerateContent(page.pagePtr);
  }

  describe(): string {
    return `Type into ${this.runId}`;
  }
}

function safeGetFont(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  objPtr: number,
): number {
  const fn = (m as unknown as { FPDFTextObj_GetFont?: (p: number) => number })
    .FPDFTextObj_GetFont;
  if (!fn) return 0;
  try {
    return fn(objPtr);
  } catch {
    return 0;
  }
}

function snapshotRevertLines(
  run: import("@app/tools/pdfTextEditor/v2/model/TextRun").TextRun,
  prevText: string,
): RevertLine[] {
  const lines = prevText.split(/\r?\n/);
  const lineHeight =
    run.paragraphLineHeight > 0 ? run.paragraphLineHeight : run.fontSize * 1.2;
  return lines.map((text, idx) => ({
    text,
    x: run.matrix.e,
    y: run.matrix.f - idx * lineHeight,
    fill: { ...run.fill },
    fontSize: Math.max(4, run.fontSize),
  }));
}
