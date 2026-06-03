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
  applyParagraphEditPlan,
  applyPartialEditPlan,
  planParagraphEdit,
  planPartialEdit,
  setObjText,
  type ParagraphEditPlan,
  type PartialEditPlan,
} from "@app/tools/pdfTextEditor/v2/commands/partialEdit";
import { helveticaVariantFor } from "@app/tools/pdfTextEditor/v2/util/helveticaVariant";
import type { ParagraphLineSlot } from "@app/tools/pdfTextEditor/v2/model/TextRun";

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
  /** Set when the apply path took the paragraph-aware partial shortcut. */
  private paragraphPlan: ParagraphEditPlan | null = null;
  private paragraphInsertedPtrs: number[] = [];
  private prevParagraphSlots: ParagraphLineSlot[] = [];

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

    // PARAGRAPH-AWARE PARTIAL PATH: paragraphs (multi-line runs) keep
    // per-line sub-run data in `paragraphLineSlots`. Walk each slot,
    // run the LCS path per line, keep fonts where survival is clean.
    // Bails to overlay when line count changes (typed Enter / deleted a
    // newline) or any slot's per-line plan fails.
    if (
      this.partialPlan === null &&
      this.paragraphPlan === null &&
      run.paragraphLineSlots.length > 1
    ) {
      const paraPlan = planParagraphEdit(
        run,
        this.prevText ?? "",
        this.nextText,
      );
      if (paraPlan) {
        this.paragraphPlan = paraPlan;
        this.prevParagraphSlots = paraPlan.prevSlots;
        const result = applyParagraphEditPlan(
          doc,
          page,
          run,
          paraPlan,
          this.nextText,
        );
        this.paragraphInsertedPtrs = result.insertedPtrs;
        run.paragraphLineSlots = result.newSlots;
        run.bounds = {
          ...run.bounds,
          x: result.newBoundsX,
          width: result.newBoundsWidth,
        };
        // Keep mergedFrom* synchronized with slot[0] so a later
        // single-line partial edit on the rep continues to work.
        const firstSlot = result.newSlots[0];
        run.mergedFromPtrs = [...firstSlot.mergedFromPtrs];
        run.mergedFromTexts = [...firstSlot.mergedFromTexts];
        run.mergedFromBounds = firstSlot.mergedFromBounds.map((b) => ({
          ...b,
        }));
        run.mergedFromCharStarts = [...firstSlot.mergedFromCharStarts];
        if (firstSlot.mergedFromPtrs.length > 0) {
          run.pdfiumObjPtr = firstSlot.mergedFromPtrs[0];
        }
        run.text = this.nextText;
        run.dirty = true;
        page.markDirty();
        page.markNeedsGenerate();
        return;
      }
    }

    // SURGICAL DIFF PATH (single-line). Skipped when:
    //   - the run is a paragraph (paragraphLineSlots > 1): the rep's own
    //     mergedFromPtrs mirror only line 0, so a planner against the
    //     whole paragraph text would emit wrong output.
    //   - nextText contains a newline that prevText doesn't: the LCS
    //     would classify the `\n` and everything after it as inserted,
    //     and `applyPartialEditPlan` emits inserts at `run.matrix.f` -
    //     the SAME baseline as the original line, so the would-be
    //     second-line text lands past the right edge of line 1 and is
    //     mostly clipped. Force overlay (which splits by `\n` and emits
    //     each line at a real second baseline).
    if (
      this.partialPlan === null &&
      run.mergedFromPtrs.length > 0 &&
      run.paragraphLineSlots.length < 2 &&
      !/\r?\n/.test(this.nextText)
    ) {
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
        run.mergedFromCharStarts = result.newMergedFromCharStarts;
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
    // Reusing the source font handle works when:
    //   * Every nextText char already appears in prevText (`safeChars`)
    //     - guarantees the font has a glyph for each char (it just
    //       rendered them).
    //   * The font is NOT a subset (subsets only embed the glyphs the
    //     original text used; we can't rely on Unicode→glyph mapping
    //     beyond the original char set).
    //   * The run lives at page level (FPDFPageObj_CreateTextObj only
    //     accepts page-level docPtr; form-xobject text needs a different
    //     code path that PDFium doesn't expose cleanly).
    //
    // The previous extra `looksBase14` check was overly conservative -
    // it forced full-font non-base14 sources (LMRoman, etc.) to flip to
    // base-14 Helvetica on any edit, even safe-char deletes. Dropping
    // it lets typed-into-LMRoman titles keep their LMRoman font.
    const canReuseFont = safeChars && !run.fontSubset && run.containerPtr === 0;
    const originalFontPtr =
      canReuseFont && run.pdfiumObjPtr ? safeGetFont(m, run.pdfiumObjPtr) : 0;

    this.revertLines = snapshotRevertLines(run, this.prevText ?? "");

    // Detach any cover rect that a PRIOR overlay edit left on the page.
    // The previous EditTextCommand instance recorded its own coverRectPtr
    // in its `createdPtrs`, but those references die with the command -
    // PDFium still owns the rect. Without per-run tracking, a sequence
    // of overlay edits stacks rects on top of each other.
    if (run.coverRectPtr) {
      try {
        m.FPDFPage_RemoveObject(page.pagePtr, run.coverRectPtr);
      } catch {
        /* best-effort */
      }
      run.coverRectPtr = 0;
    }

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
      if (this.coverRectPtr) {
        this.createdPtrs.push(this.coverRectPtr);
        run.coverRectPtr = this.coverRectPtr;
      }
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
    // Per-line emit metadata used to rebuild paragraphLineSlots so the
    // NEXT edit can route back through paragraph-aware partial-edit
    // (font-preserving) instead of falling to overlay again forever.
    const perLineEmits: Array<{ ptrs: number[]; text: string; y: number }> = [];
    for (let i = 0; i < outputLines.length; i++) {
      const y = run.matrix.f - i * lineHeight;
      // Empty lines (a newline at end-of-text, or a blank line inserted
      // mid-paragraph) get a placeholder slot - no PDFium object is
      // emitted, because an empty text object's reported bounds are
      // implementation-defined: `FPDFPageObj_GetBounds` can return
      // {0,0,0,0} or fail, and either flavour breaks the next edit's
      // anchor calculation (typed chars land at x=0 instead of at the
      // line's intended left margin). The slot's `matrixE` carries the
      // expected anchor; `planParagraphEdit` bails (mergedFromPtrs===0)
      // on a type-into-empty-line edit so the overlay path handles it,
      // and the overlay path emits at `run.matrix.e` directly.
      if (outputLines[i].length === 0) {
        perLineEmits.push({ ptrs: [], text: "", y });
        continue;
      }
      const ptrs = emitTextLine({
        doc,
        page,
        text: outputLines[i],
        x: run.matrix.e,
        y,
        fontSize: run.fontSize,
        fill: run.fill,
        originalFontPtr,
        fallbackFamily,
      });
      if (ptrs.length === 0) continue;
      this.createdPtrs.push(...ptrs);
      allEmittedPtrs.push(...ptrs);
      lineAnchorPtrs.push(ptrs[0]);
      perLineEmits.push({ ptrs, text: outputLines[i], y });
    }

    if (lineAnchorPtrs.length > 0) {
      this.newTextPtr = lineAnchorPtrs[0];
      run.pdfiumObjPtr = lineAnchorPtrs[0];
      if (originalFontPtr === 0) {
        run.fontId = `base14:${fallbackFamily}`;
        run.fontSubset = false;
      } else {
        // Borrow path: the new objects use the borrowed font handle.
        // Mark fontSubset=false so the NEXT edit's `canReuseFont` check
        // (which gates on `!run.fontSubset`) doesn't block the borrow
        // even though the borrowed handle came from a subset source.
        // The next edit re-validates via safeChars regardless.
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
      if (perLineEmits.length > 1) {
        // Remember the line height so paragraph-partial / future overlay
        // emits land at the same baselines we just established.
        run.paragraphLineHeight = lineHeight;
      }
    }

    run.mergedFromPtrs = [];
    // Clear the parallel arrays too: planPartialEdit bails on length
    // mismatch, so leaving stale text/bounds/char-starts when ptrs is
    // reset to [] would force every SUBSEQUENT edit to fall to the
    // overlay path and flip the font again - a self-reinforcing
    // regression where one overlay edit poisons the run for life.
    run.mergedFromTexts = [];
    run.mergedFromBounds = [];
    run.mergedFromCharStarts = [];
    // Rebuild paragraphLineSlots from the fresh emit so the next edit on
    // this paragraph can re-engage the font-preserving partial path.
    // Each slot owns one output line; its `mergedFromPtrs` carry the
    // freshly emitted per-word ptrs and `mergedFromBounds` are read
    // directly from PDFium so subsequent inserts anchor correctly.
    if (perLineEmits.length > 1) {
      run.paragraphLineSlots = buildSlotsFromOverlayEmit(
        m,
        run,
        perLineEmits,
        originalFontPtr === 0 ? `base14:${fallbackFamily}` : run.fontId,
      );
    } else {
      // Single-line emit. Skip slots; the single-line partial path
      // works off mergedFromPtrs, which the overlay path deliberately
      // clears (above) since the new emit may not carry per-sub-run
      // bounds for the single-line case.
      run.paragraphLineSlots = [];
    }
    // Don't reset paragraphLeafPtrs here - we just set them above to the
    // freshly-emitted chunks so the next overlay edit can remove them.
    run.text = this.nextText;
    run.dirty = true;
    page.markDirty();
    page.markNeedsGenerate();
  }

  revert(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run || this.prevText === null) return;
    const m = doc.module;

    // Paragraph-aware partial revert: remove every per-slot insert ptr,
    // re-emit fallback chunks at each removed sub-run's original spot.
    // The original PDFium sub-objects are gone permanently (PDFium has
    // no insert-into-page-at-position API that restores byte-identical
    // glyphs) so the revert reads as the prev text in a base-14
    // fallback font - matches what the overlay-revert path does too.
    if (this.paragraphPlan) {
      for (const ptr of this.paragraphInsertedPtrs) {
        if (!ptr) continue;
        try {
          m.FPDFPage_RemoveObject(page.pagePtr, ptr);
        } catch {
          /* best-effort */
        }
      }
      this.paragraphInsertedPtrs = [];
      // Re-emit the removed sub-objects as Helvetica fallback chunks at
      // their original x positions and per-slot baselines.
      const revertFallback = helveticaVariantFor(this.prevFontId ?? run.fontId);
      const restored: number[] = [];
      for (const entry of this.paragraphPlan.perSlot) {
        const prevSlot = this.prevParagraphSlots[entry.slotIdx];
        if (!prevSlot) continue;
        // Restore in-place "modify" sub-runs to their original text.
        for (const op of entry.plan.ops) {
          if (op.type === "modify" && op.subRunIdx !== undefined) {
            setObjText(
              m,
              prevSlot.mergedFromPtrs[op.subRunIdx],
              prevSlot.mergedFromTexts[op.subRunIdx] ?? "",
            );
          }
        }
        for (const { ptr } of entry.plan.removePtrs) {
          const origIdx = prevSlot.mergedFromPtrs.indexOf(ptr);
          if (origIdx < 0) continue;
          const text = prevSlot.mergedFromTexts[origIdx] ?? "";
          const bounds = prevSlot.mergedFromBounds[origIdx];
          if (!text || !bounds) continue;
          const ptrs = emitTextLine({
            doc,
            page,
            text,
            x: bounds.x,
            y: prevSlot.baselineY,
            fontSize: prevSlot.fontSize,
            fill: run.fill,
            originalFontPtr: 0,
            fallbackFamily: revertFallback,
          });
          restored.push(...ptrs);
        }
      }
      this.revertCreatedPtrs = restored;
      run.paragraphLineSlots = this.prevParagraphSlots.map((s) => ({
        ...s,
        mergedFromPtrs: [...s.mergedFromPtrs],
        mergedFromTexts: [...s.mergedFromTexts],
        mergedFromBounds: s.mergedFromBounds.map((b) => ({ ...b })),
        mergedFromCharStarts: [...s.mergedFromCharStarts],
      }));
      run.text = this.prevText;
      run.dirty = true;
      this.paragraphPlan = null;
      page.markDirty();
      page.markNeedsGenerate();
      return;
    }

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
      // In-place "modify" sub-runs kept their object (and font); restore
      // their original text so undo shows the pre-edit characters.
      for (const op of this.partialPlan.ops) {
        if (op.type === "modify" && op.subRunIdx !== undefined) {
          setObjText(
            m,
            this.prevMergedFromPtrs[op.subRunIdx],
            this.prevMergedFromTexts[op.subRunIdx] ?? "",
          );
        }
      }
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
      page.markNeedsGenerate();
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
    page.markNeedsGenerate();
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

/**
 * Reconstruct `paragraphLineSlots` from the data the overlay loop
 * just emitted, so a subsequent edit on this paragraph can re-engage
 * `planParagraphEdit` (font-preserving per-line LCS) instead of
 * falling to the overlay path again forever.
 *
 * Each slot owns one output line. `mergedFromPtrs` carries the per-word
 * ptrs we created via `emitTextLine`; `mergedFromBounds` is read straight
 * from PDFium so subsequent inserts anchor at the exact glyph positions
 * the renderer used.
 */
function buildSlotsFromOverlayEmit(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  run: import("@app/tools/pdfTextEditor/v2/model/TextRun").TextRun,
  perLineEmits: Array<{ ptrs: number[]; text: string; y: number }>,
  fontId: string,
): import("@app/tools/pdfTextEditor/v2/model/TextRun").ParagraphLineSlot[] {
  const slots = [];
  let cursor = 0;
  for (const emit of perLineEmits) {
    const text = emit.text;
    const startChar = cursor;
    const endChar = startChar + text.length;
    // Empty-line slot: no PDFium sub-objects, no bounds. matrixE +
    // baselineY carry the expected anchor for the next edit. The next
    // keystroke on this line triggers `planParagraphEdit`, which bails
    // when slot.mergedFromPtrs is empty - the overlay path then runs
    // and emits at run.matrix.e (correct), and the rebuilt slot picks
    // up real bounds from the fresh emit.
    if (emit.ptrs.length === 0 || text.length === 0) {
      slots.push({
        startChar,
        endChar,
        baselineY: emit.y,
        matrixE: run.matrix.e,
        containerPtr: 0,
        fontId,
        fontSize: run.fontSize,
        fontSubset: false,
        mergedFromPtrs: [],
        mergedFromTexts: [],
        mergedFromBounds: [],
        mergedFromCharStarts: [],
      });
      cursor = endChar + 1;
      continue;
    }
    // Distribute the text across the emitted ptrs by character-count
    // proportion. emitTextLine emits one ptr per whitespace-separated
    // word, so partition `text` on whitespace runs and align with ptrs.
    // For lines without whitespace, ptrs.length === 1 and the whole
    // line is one sub-run.
    const mergedFromTexts: string[] = [];
    const mergedFromPtrs: number[] = [];
    const mergedFromBounds: Array<{ x: number; right: number }> = [];
    const mergedFromCharStarts: number[] = [];
    if (emit.ptrs.length === 1) {
      mergedFromPtrs.push(emit.ptrs[0]);
      mergedFromTexts.push(text);
      mergedFromBounds.push(boundsFromPtr(m, emit.ptrs[0], run.matrix.e));
      mergedFromCharStarts.push(0);
    } else {
      const words = text.split(/(\s+)/).filter((w) => w.length > 0);
      const nonGapWords = words.filter((w) => !/^\s+$/.test(w));
      const used = Math.min(emit.ptrs.length, nonGapWords.length);
      let cur = 0;
      let wordIdx = 0;
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        if (/^\s+$/.test(w)) {
          cur += w.length;
          continue;
        }
        if (wordIdx >= used) {
          cur += w.length;
          wordIdx += 1;
          continue;
        }
        const ptr = emit.ptrs[wordIdx];
        mergedFromPtrs.push(ptr);
        mergedFromTexts.push(w);
        mergedFromBounds.push(boundsFromPtr(m, ptr, run.matrix.e));
        mergedFromCharStarts.push(cur);
        cur += w.length;
        wordIdx += 1;
      }
    }
    slots.push({
      startChar,
      endChar,
      baselineY: emit.y,
      matrixE: run.matrix.e,
      containerPtr: 0,
      fontId,
      fontSize: run.fontSize,
      fontSubset: false,
      mergedFromPtrs,
      mergedFromTexts,
      mergedFromBounds,
      mergedFromCharStarts,
    });
    cursor = endChar + 1; // +1 for the "\n" separator
  }
  return slots;
}

function boundsFromPtr(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  ptr: number,
  fallbackX: number,
): { x: number; right: number } {
  const l = m.pdfium.wasmExports.malloc(4);
  const b = m.pdfium.wasmExports.malloc(4);
  const r = m.pdfium.wasmExports.malloc(4);
  const t = m.pdfium.wasmExports.malloc(4);
  try {
    if (!m.FPDFPageObj_GetBounds(ptr, l, b, r, t)) {
      return { x: fallbackX, right: fallbackX };
    }
    return {
      x: m.pdfium.getValue(l, "float"),
      right: m.pdfium.getValue(r, "float"),
    };
  } finally {
    m.pdfium.wasmExports.free(l);
    m.pdfium.wasmExports.free(b);
    m.pdfium.wasmExports.free(r);
    m.pdfium.wasmExports.free(t);
  }
}
