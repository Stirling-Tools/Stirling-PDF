import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import { PdfiumTextWriter } from "@app/tools/pdfTextEditor/v2/pdfium/PdfiumTextWriter";
import { sampleBackground } from "@app/tools/pdfTextEditor/v2/pdfium/BackgroundSampler";
import {
  charcodesResolveFully,
  collectContainersByPtr,
  collectMemberPtrs,
  emitFillRect,
  emitTextLine,
  everyCharIn,
  inkFromRun,
  removeMemberPtrs,
  rotationFromMatrix,
} from "@app/tools/pdfTextEditor/v2/commands/editTextHelpers";
import {
  bestFontPtrForText,
  applyParagraphEditPlan,
  applyPartialEditPlan,
  planModifiesWhitespace,
  planParagraphEdit,
  planPartialEdit,
  setObjText,
  type ParagraphEditPlan,
  type PartialEditPlan,
} from "@app/tools/pdfTextEditor/v2/commands/partialEdit";
import { helveticaVariantFor } from "@app/tools/pdfTextEditor/v2/util/helveticaVariant";
import type { Page } from "@app/tools/pdfTextEditor/v2/model/Page";
import type {
  ParagraphLineSlot,
  TextRun,
} from "@app/tools/pdfTextEditor/v2/model/TextRun";
import { transformObject } from "@app/tools/pdfTextEditor/v2/util/objectTransform";

interface RevertLine {
  text: string;
  x: number;
  y: number;
  fill: { r: number; g: number; b: number; a: number };
  fontSize: number;
  /** Source run's letter-spacing so an undo re-emit keeps the tracking. */
  charSpacingPt: number;
}

/** One rebuilt line for {@link EditTextCommand.rebuildAsOverlayModel}. */
interface RebuildLine {
  baselineY: number;
  fontSize: number;
  subRuns: Array<{ ptr: number; text: string; x: number; removed: boolean }>;
}

/** Snapshot of a run's paragraph model for the line-edit revert. */
interface RunModelSnapshot {
  text: string;
  matrixE: number;
  matrixF: number;
  bounds: { x: number; y: number; width: number; height: number };
  paragraphLineHeight: number;
  paragraphMemberPtrs: number[];
  paragraphMemberContainers: number[];
  paragraphMemberFs: number[];
  paragraphLeafPtrs: number[];
  paragraphLeafContainers: number[];
  paragraphLineSlots: ParagraphLineSlot[];
  mergedFromPtrs: number[];
  mergedFromTexts: string[];
  mergedFromBounds: Array<{ x: number; right: number }>;
  mergedFromCharStarts: number[];
  fontId: string;
  fontSubset: boolean;
  pdfiumObjPtr: number;
}

// True when a partial-edit plan only ADDED objects (no original object was
// freed via removePtrs, none mutated in place via a "modify" op).
function planIsPureInsert(plan: PartialEditPlan): boolean {
  return (
    plan.removePtrs.length === 0 && plan.ops.every((op) => op.type !== "modify")
  );
}

/** Edit a text run. */
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
  /** Rotation of the run when apply() snapshotted it; re-applied on revert. */
  private revertRotation: { cos: number; sin: number } | null = null;
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
  // Full pre-edit model snapshot, captured by the partial / paragraph-partial
  // apply paths.
  private editSnapshot: RunModelSnapshot | null = null;
  /** Set when the apply path took the paragraph line add/remove shortcut. */
  private lineEdit: {
    /** Matched lines translated to a new baseline (reversed on revert). */
    moves: Array<{ ptr: number; dy: number }>;
    /** Fresh objects emitted for new/changed lines (removed on revert). */
    createdPtrs: number[];
    /** Deleted lines, re-emitted as fallback on revert. */
    removed: Array<{ text: string; x: number; y: number; fontSize: number }>;
    prev: RunModelSnapshot;
  } | null = null;

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
    // No-op edit: a contentEditable insert can fire several `input` events for
    // one keystroke burst, re-dispatching the SAME final text.
    if (this.prevText === this.nextText) return;

    const alreadyBase14 = /^base14:/.test(run.fontId);
    // A run rotated within the page can't use the surgical partial/paragraph
    // paths - those assume horizontal layout.
    const isRotated = !!rotationFromMatrix(run.matrix);

    // PARAGRAPH-AWARE PARTIAL PATH: paragraphs (multi-line runs) keep per-line
    // sub-run data in `paragraphLineSlots`.
    if (
      this.partialPlan === null &&
      this.paragraphPlan === null &&
      run.paragraphLineSlots.length > 1 &&
      !isRotated
    ) {
      const paraPlan = planParagraphEdit(
        run,
        this.prevText ?? "",
        this.nextText,
      );
      if (paraPlan) {
        this.paragraphPlan = paraPlan;
        this.prevParagraphSlots = paraPlan.prevSlots;
        this.editSnapshot = snapshotRunModel(run);
        const result = applyParagraphEditPlan(doc, page, run, paraPlan);
        this.paragraphInsertedPtrs = result.insertedPtrs;
        run.paragraphLineSlots = result.newSlots;
        run.bounds = {
          ...run.bounds,
          x: result.newBoundsX,
          width: clampWidthToPage(
            result.newBoundsX,
            result.newBoundsWidth,
            page,
          ),
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

    // PARAGRAPH LINE ADD/REMOVE PATH.
    if (
      this.partialPlan === null &&
      this.paragraphPlan === null &&
      this.lineEdit === null &&
      this.prevText !== null &&
      this.prevText.length > 0 &&
      run.paragraphLineSlots.length >= 1 &&
      !isRotated
    ) {
      const prevLines = this.prevText.split(/\r?\n/);
      const nextLines = this.nextText.split(/\r?\n/);
      if (prevLines.length !== nextLines.length) {
        if (run.paragraphLineSlots.length === prevLines.length) {
          // Slots map 1:1 to lines (a grow-mode paragraph) - diff per line.
          this.applyParagraphLineEdit(doc, page, run, prevLines, nextLines);
          run.text = this.nextText;
          run.dirty = true;
          page.markDirty();
          page.markNeedsGenerate();
          return;
        }
        if (
          this.nextText.startsWith(this.prevText) &&
          /^\r?\n/.test(this.nextText.slice(this.prevText.length))
        ) {
          // Soft-wrapped paragraph: can't diff per line.
          this.applyParagraphAppend(doc, page, run);
          run.text = this.nextText;
          run.dirty = true;
          page.markDirty();
          page.markNeedsGenerate();
          return;
        }
      }
    }

    // SURGICAL DIFF PATH (single-line).
    if (
      this.partialPlan === null &&
      run.mergedFromPtrs.length > 0 &&
      run.paragraphLineSlots.length < 2 &&
      !/\r?\n/.test(this.nextText) &&
      !isRotated
    ) {
      const partial = planPartialEdit(run, this.prevText ?? "", this.nextText);
      // An in-place "modify" op that re-SetTexts whitespace paints „ on an
      // embedded subset font with no space glyph.
      if (partial && !planModifiesWhitespace(partial)) {
        this.partialPlan = partial;
        this.prevMergedFromPtrs = [...run.mergedFromPtrs];
        this.prevMergedFromTexts = [...run.mergedFromTexts];
        this.prevMergedFromBounds = run.mergedFromBounds.map((b) => ({ ...b }));
        this.editSnapshot = snapshotRunModel(run);
        const result = applyPartialEditPlan(doc, page, run, partial);
        this.partialInsertedPtrs = result.insertedPtrs;
        run.mergedFromPtrs = result.newMergedFromPtrs;
        run.mergedFromTexts = result.newMergedFromTexts;
        run.mergedFromBounds = result.newMergedFromBounds;
        run.mergedFromCharStarts = result.newMergedFromCharStarts;
        run.bounds = {
          ...run.bounds,
          x: result.newBoundsX,
          width: clampWidthToPage(
            result.newBoundsX,
            result.newBoundsWidth,
            page,
          ),
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

    // Force overlay whenever the in-place SetText path can't keep every PDFium
    // object up to date: - paragraphs or newline-containing text.
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
    // \r/\n are split into separate output lines, so they must NOT gate font
    // reuse.
    const safeChars = everyCharIn(
      this.nextText.replace(/[\r\n]/g, ""),
      this.prevText ?? "",
    );
    // Reusing the source font handle works when every nextText char already
    // appears in prevText, which guarantees a glyph. That proxy is strict: it
    // threw away a fully embedded face the moment a NEW letter was typed. So
    // also accept the case where the charcodes provably resolve for the whole
    // string, which is exactly what the emit path needs to succeed.
    const candidateFontPtr = run.pdfiumObjPtr
      ? safeGetFont(m, run.pdfiumObjPtr)
      : 0;
    const canReuseFont =
      run.containerPtr === 0 &&
      (safeChars ||
        charcodesResolveFully(
          m,
          candidateFontPtr,
          this.nextText.replace(/[\r\n]/g, ""),
          page.pagePtr,
          doc.docPtr,
        ));
    // Borrow the font of the member sharing the most chars with the new text.
    const borrowPtrs = collectMemberPtrs(run);
    const borrowTexts =
      run.mergedFromTexts.length === borrowPtrs.length
        ? run.mergedFromTexts
        : borrowPtrs.map(() => run.text);
    const originalFontPtr = canReuseFont
      ? bestFontPtrForText(m, borrowPtrs, borrowTexts, this.nextText) ||
        (run.pdfiumObjPtr ? safeGetFont(m, run.pdfiumObjPtr) : 0)
      : 0;

    this.revertLines = snapshotRevertLines(run, this.prevText ?? "");
    this.revertRotation = rotationFromMatrix(run.matrix) ?? null;

    // Detach any cover rect that a PRIOR overlay edit left on the page.
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

    // Only stamp a cover rect when the sampler is CONFIDENT it found a uniform
    // background colour.
    if (!allRemoved && bg.confident) {
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
    // One "line anchor" ptr per output line; plus any extra per-word ptrs from
    // space preservation, kept for leaf removal on subsequent edits.
    const lineAnchorPtrs: number[] = [];
    const allEmittedPtrs: number[] = [];
    // Per-line emit metadata used to rebuild paragraphLineSlots so the NEXT
    // edit can route back through paragraph-aware partial-edit instead of.
    const perLineEmits: Array<{ ptrs: number[]; text: string; y: number }> = [];
    // Step each line along the run's rotated down-axis: the (0,-lineHeight)
    // stepping vector transformed by [cos,-sin] gives (sin*L, -cos*L).
    const rot = rotationFromMatrix(run.matrix);
    for (let i = 0; i < outputLines.length; i++) {
      const x = run.matrix.e + (rot ? i * rot.sin * lineHeight : 0);
      const y = run.matrix.f - i * lineHeight * (rot ? rot.cos : 1);
      // Empty lines get a placeholder slot.
      if (outputLines[i].length === 0) {
        perLineEmits.push({ ptrs: [], text: "", y });
        continue;
      }
      const ptrs = emitTextLine({
        doc,
        page,
        text: outputLines[i],
        x,
        y,
        fontSize: run.fontSize,
        fill: run.fill,
        ...inkFromRun(run),
        originalFontPtr,
        originalFontSubset: run.fontSubset,
        charSpacingPt: run.charSpacingPt,
        fallbackFamily,
        // Keep the run's rotation on re-emit (no-op for upright text).
        rotation: rot,
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
    // Clear the parallel arrays too: planPartialEdit bails on length mismatch.
    run.mergedFromTexts = [];
    run.mergedFromBounds = [];
    run.mergedFromCharStarts = [];
    // Rebuild paragraphLineSlots from the fresh emit so the next edit on this
    // paragraph can re-engage the font-preserving partial path.
    if (perLineEmits.length > 1) {
      run.paragraphLineSlots = buildSlotsFromOverlayEmit(
        m,
        run,
        perLineEmits,
        originalFontPtr === 0 ? `base14:${fallbackFamily}` : run.fontId,
      );
    } else {
      // Single-line emit.
      run.paragraphLineSlots = [];
    }
    // Don't reset paragraphLeafPtrs here - we just set them above to the
    // freshly-emitted chunks so the next overlay edit can remove them.
    run.text = this.nextText;
    run.dirty = true;
    page.markDirty();
    page.markNeedsGenerate();
  }

  // Exactly one revert strategy member may be set per apply. Enforced only by
  // guard ordering, so fail fast in dev if two paths ran or a member leaked.
  private assertSingleRevertPath(): void {
    const set =
      (this.lineEdit !== null ? 1 : 0) +
      (this.paragraphPlan !== null ? 1 : 0) +
      (this.partialPlan !== null ? 1 : 0) +
      (this.overlaid ? 1 : 0);
    if (set > 1) {
      console.error(
        `EditTextCommand revert: ${set} strategy members set, expected <=1`,
      );
    }
  }

  revert(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run || this.prevText === null) return;
    this.assertSingleRevertPath();
    const m = doc.module;

    // Paragraph line add/remove revert: move matched lines back to their
    // original baselines, drop the freshly-emitted new/changed lines.
    if (this.lineEdit) {
      for (let i = this.lineEdit.moves.length - 1; i >= 0; i--) {
        const mv = this.lineEdit.moves[i];
        try {
          transformObject(m, mv.ptr, 1, 0, 0, 1, 0, -mv.dy);
        } catch {
          /* best-effort */
        }
      }
      for (const ptr of this.lineEdit.createdPtrs) {
        if (!ptr) continue;
        try {
          m.FPDFPage_RemoveObject(page.pagePtr, ptr);
        } catch {
          /* best-effort */
        }
      }
      restoreRunModel(run, this.lineEdit.prev);
      if (this.lineEdit.removed.length > 0) {
        const fallbackFamily = helveticaVariantFor(
          this.prevFontId ?? run.fontId,
        );
        for (const rem of this.lineEdit.removed) {
          const ptrs = emitTextLine({
            doc,
            page,
            text: rem.text,
            x: rem.x,
            y: rem.y,
            fontSize: rem.fontSize,
            fill: run.fill,
            ...inkFromRun(run),
            originalFontPtr: 0,
            charSpacingPt: run.charSpacingPt,
            fallbackFamily,
          });
          patchSlotPtrsByBaseline(m, run, rem.y, ptrs, rem.text);
        }
        reflattenLeafArrays(run);
      }
      run.text = this.prevText;
      run.dirty = true;
      this.lineEdit = null;
      page.markDirty();
      page.markNeedsGenerate();
      return;
    }

    // Paragraph-aware partial revert: remove every per-slot insert ptr, re-emit
    // fallback chunks at each removed sub-run's original spot.
    if (this.paragraphPlan) {
      // Remove the chunks the forward apply inserted.
      for (const ptr of this.paragraphInsertedPtrs) {
        if (!ptr) continue;
        try {
          m.FPDFPage_RemoveObject(page.pagePtr, ptr);
        } catch {
          /* best-effort */
        }
      }
      this.paragraphInsertedPtrs = [];
      // Pure-insert edit (no original object freed/mutated): every original
      // object is still alive, so restore the exact pre-edit model.
      const pureInsert = this.paragraphPlan.perSlot.every(
        (e) => e.plan !== null && planIsPureInsert(e.plan),
      );
      if (pureInsert && this.editSnapshot) {
        restoreRunModel(run, this.editSnapshot);
        run.text = this.prevText;
        run.dirty = true;
        this.paragraphPlan = null;
        page.markDirty();
        page.markNeedsGenerate();
        return;
      }
      const revertFallback = helveticaVariantFor(this.prevFontId ?? run.fontId);
      // Rebuild every line from the pre-edit slots: kept/modified sub-runs keep
      // their live original object.
      const lines: RebuildLine[] = [];
      for (let s = 0; s < this.prevParagraphSlots.length; s++) {
        const prevSlot = this.prevParagraphSlots[s];
        const entry = this.paragraphPlan.perSlot.find((e) => e.slotIdx === s);
        if (entry && entry.plan) {
          for (const op of entry.plan.ops) {
            if (op.type === "modify" && op.subRunIdx !== undefined) {
              setObjText(
                m,
                prevSlot.mergedFromPtrs[op.subRunIdx],
                prevSlot.mergedFromTexts[op.subRunIdx] ?? "",
              );
            }
          }
        }
        // A fresh-emit slot (plan === null) had ALL its original objects
        // removed during apply, so re-emit every one of them on revert.
        const removed = new Set(
          entry
            ? entry.plan
              ? entry.plan.removePtrs.map((r) => r.ptr)
              : prevSlot.mergedFromPtrs
            : [],
        );
        lines.push({
          baselineY: prevSlot.baselineY,
          fontSize: prevSlot.fontSize,
          subRuns: prevSlot.mergedFromPtrs.map((ptr, i) => ({
            ptr,
            text: prevSlot.mergedFromTexts[i] ?? "",
            x: prevSlot.mergedFromBounds[i]?.x ?? prevSlot.matrixE,
            removed: removed.has(ptr),
          })),
        });
      }
      this.rebuildAsOverlayModel(doc, page, run, lines, revertFallback);
      run.text = this.prevText;
      run.dirty = true;
      this.paragraphPlan = null;
      page.markDirty();
      page.markNeedsGenerate();
      return;
    }

    // Partial-edit fast path revert: the removed sub-objects are gone from
    // PDFium permanently.
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
      // No original objects were destroyed: restore the EXACT pre-edit model so
      // undo keeps the original embedded fonts AND redo re-engages the.
      if (this.partialPlan.removePtrs.length === 0 && this.editSnapshot) {
        restoreRunModel(run, this.editSnapshot);
        run.text = this.prevText;
        run.dirty = true;
        this.partialPlan = null;
        page.markDirty();
        page.markNeedsGenerate();
        return;
      }
      const revertFallback = helveticaVariantFor(this.prevFontId ?? run.fontId);
      const removed = new Set(this.partialPlan.removePtrs.map((r) => r.ptr));
      this.rebuildAsOverlayModel(
        doc,
        page,
        run,
        [
          {
            baselineY: run.matrix.f,
            fontSize: run.fontSize,
            subRuns: this.prevMergedFromPtrs.map((ptr, i) => ({
              ptr,
              text: this.prevMergedFromTexts[i] ?? "",
              x: this.prevMergedFromBounds[i]?.x ?? run.matrix.e,
              removed: removed.has(ptr),
            })),
          },
        ],
        revertFallback,
      );
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
    // pointers (if they lived in a form) are gone forever.
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
        charSpacingPt: line.charSpacingPt,
        fallbackFamily: revertFallback,
        // Keep the run's original orientation - without this, undoing an
        // edit on a rotated run scattered its text axis-aligned.
        rotation: this.revertRotation ?? undefined,
      });
      if (ptrs.length === 0) continue;
      lineAnchorPtrs.push(ptrs[0]);
      allRestoredPtrs.push(...ptrs);
    }

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

  // Apply a paragraph edit that changed the LINE COUNT (Enter typed or a
  // newline deleted) where slots map 1:1 to lines.
  private applyParagraphLineEdit(
    doc: EditorDocument,
    page: Page,
    run: TextRun,
    prevLines: string[],
    nextLines: string[],
  ): void {
    const m = doc.module;
    const slots = run.paragraphLineSlots;
    const lineHeight =
      run.paragraphLineHeight > 0
        ? run.paragraphLineHeight
        : run.fontSize * 1.2;
    const topBaseline = slots[0]?.baselineY ?? run.matrix.f;
    const leftX = slots[0]?.matrixE ?? run.matrix.e;
    const fallbackFamily = helveticaVariantFor(this.prevFontId ?? run.fontId);
    const match = lineLCS(prevLines, nextLines);

    this.lineEdit = {
      moves: [],
      createdPtrs: [],
      removed: [],
      prev: snapshotRunModel(run),
    };

    const newSlots: ParagraphLineSlot[] = [];
    const newLeaf: number[] = [];
    const newLeafContainers: number[] = [];
    const newMemberPtrs: number[] = [];
    const newMemberFs: number[] = [];
    const usedPrev = new Set<number>();
    let cursor = 0;
    for (let i = 0; i < nextLines.length; i++) {
      const text = nextLines[i];
      const y = topBaseline - i * lineHeight;
      const prevIdx = match.get(i);
      let slot: ParagraphLineSlot;
      if (prevIdx !== undefined && slots[prevIdx]) {
        // Unchanged line: keep its objects, translate to the new baseline.
        usedPrev.add(prevIdx);
        const src = slots[prevIdx];
        const dy = y - src.baselineY;
        if (Math.abs(dy) > 0.001) {
          for (const ptr of src.mergedFromPtrs) {
            if (!ptr) continue;
            try {
              transformObject(m, ptr, 1, 0, 0, 1, 0, dy);
            } catch {
              /* best-effort - stale ptr */
            }
            this.lineEdit.moves.push({ ptr, dy });
          }
        }
        slot = cloneSlot(src);
        slot.baselineY = y;
        for (const ptr of src.mergedFromPtrs) {
          if (ptr) {
            newLeaf.push(ptr);
            newLeafContainers.push(src.containerPtr);
          }
        }
        newMemberPtrs.push(src.mergedFromPtrs[0] ?? 0);
        newMemberFs.push(y);
      } else if (text.length === 0) {
        slot = emptySlot(y, leftX, run, fallbackFamily);
        newMemberPtrs.push(0);
        newMemberFs.push(y);
      } else {
        // New / changed line: emit fresh (only this line loses its font).
        const ptrs = emitTextLine({
          doc,
          page,
          text,
          x: leftX,
          y,
          fontSize: run.fontSize,
          fill: run.fill,
          ...inkFromRun(run),
          originalFontPtr: 0,
          charSpacingPt: run.charSpacingPt,
          fallbackFamily,
        });
        this.lineEdit.createdPtrs.push(...ptrs);
        for (const p of ptrs) {
          newLeaf.push(p);
          newLeafContainers.push(0);
        }
        newMemberPtrs.push(ptrs[0] ?? 0);
        newMemberFs.push(y);
        slot = buildSlotForLine(
          m,
          ptrs,
          text,
          y,
          leftX,
          run,
          `base14:${fallbackFamily}`,
        );
      }
      slot.startChar = cursor;
      slot.endChar = cursor + text.length;
      cursor += text.length + 1;
      newSlots.push(slot);
    }

    // Remove objects of any prev line no next line reused.
    for (let j = 0; j < slots.length; j++) {
      if (usedPrev.has(j)) continue;
      const src = slots[j];
      if (prevLines[j]) {
        this.lineEdit.removed.push({
          text: prevLines[j],
          x: src.mergedFromBounds[0]?.x ?? src.matrixE,
          y: src.baselineY,
          fontSize: src.fontSize,
        });
      }
      for (const ptr of src.mergedFromPtrs) {
        if (!ptr) continue;
        try {
          m.FPDFPage_RemoveObject(page.pagePtr, ptr);
        } catch {
          /* best-effort */
        }
      }
    }

    // Write the model, PRESERVING matched lines' original objects.
    run.paragraphLineSlots = newSlots;
    run.paragraphLeafPtrs = newLeaf;
    run.paragraphLeafContainers = newLeafContainers;
    run.paragraphMemberPtrs = newMemberPtrs;
    run.paragraphMemberContainers = newMemberPtrs.map(() => 0);
    run.paragraphMemberFs = newMemberFs;
    run.paragraphLineHeight = lineHeight;
    run.matrix = { ...run.matrix, e: leftX, f: topBaseline };
    if (newLeaf[0]) run.pdfiumObjPtr = newLeaf[0];
    const s0 = newSlots[0];
    if (s0) {
      run.mergedFromPtrs = [...s0.mergedFromPtrs];
      run.mergedFromTexts = [...s0.mergedFromTexts];
      run.mergedFromBounds = s0.mergedFromBounds.map((b) => ({ ...b }));
      run.mergedFromCharStarts = [...s0.mergedFromCharStarts];
    }
    let maxRight = leftX;
    for (const s of newSlots) {
      for (const b of s.mergedFromBounds) {
        if (b.right > maxRight) maxRight = b.right;
      }
    }
    run.bounds = {
      x: leftX,
      y: topBaseline - (newSlots.length - 1) * lineHeight - run.fontSize * 0.25,
      width: Math.max(0, maxRight - leftX),
      height: newSlots.length * lineHeight + run.fontSize * 0.25,
    };
  }

  /** Apply a paragraph edit that APPENDED lines (Enter + text at the end). */
  private applyParagraphAppend(
    doc: EditorDocument,
    page: Page,
    run: TextRun,
  ): void {
    const m = doc.module;
    const slots = run.paragraphLineSlots;
    const lineHeight =
      run.paragraphLineHeight > 0
        ? run.paragraphLineHeight
        : run.fontSize * 1.2;
    const leftX = slots[0]?.matrixE ?? run.matrix.e;
    const bottomBaseline = Math.min(
      run.matrix.f,
      ...slots.map((s) => s.baselineY),
    );
    const fallbackFamily = helveticaVariantFor(this.prevFontId ?? run.fontId);

    this.lineEdit = {
      moves: [],
      createdPtrs: [],
      removed: [],
      prev: snapshotRunModel(run),
    };

    // The caller only routes here when the suffix is a pure newline-prefixed
    // append, so split keeps a leading "" entry for that first break, skipped.
    const appendedLines = this.nextText
      .slice(this.prevText!.length)
      .split(/\r?\n/);
    const newSlots: ParagraphLineSlot[] = [];
    const newLeaf: number[] = [];
    const newMemberPtrs: number[] = [];
    const newMemberFs: number[] = [];
    let cursor = this.prevText!.length;
    let below = 0;
    for (let li = 1; li < appendedLines.length; li++) {
      const text = appendedLines[li];
      cursor += 1; // the "\n" separator before this line
      below += 1;
      const y = bottomBaseline - below * lineHeight;
      let slot: ParagraphLineSlot;
      if (text.length === 0) {
        slot = emptySlot(y, leftX, run, fallbackFamily);
        newMemberPtrs.push(0);
        newMemberFs.push(y);
      } else {
        const ptrs = emitTextLine({
          doc,
          page,
          text,
          x: leftX,
          y,
          fontSize: run.fontSize,
          fill: run.fill,
          ...inkFromRun(run),
          originalFontPtr: 0,
          charSpacingPt: run.charSpacingPt,
          fallbackFamily,
        });
        this.lineEdit.createdPtrs.push(...ptrs);
        newLeaf.push(...ptrs);
        newMemberPtrs.push(ptrs[0] ?? 0);
        newMemberFs.push(y);
        slot = buildSlotForLine(
          m,
          ptrs,
          text,
          y,
          leftX,
          run,
          `base14:${fallbackFamily}`,
        );
      }
      slot.startChar = cursor;
      slot.endChar = cursor + text.length;
      cursor += text.length;
      newSlots.push(slot);
    }

    // Preserve EVERY original object (fonts + layout intact); only append the
    // new lines. ReflowWrapCommand re-lines the whole paragraph on blur.
    run.paragraphLineSlots = [...slots.map(cloneSlot), ...newSlots];
    run.paragraphLeafPtrs = [...run.paragraphLeafPtrs, ...newLeaf];
    run.paragraphLeafContainers = [
      ...run.paragraphLeafContainers,
      ...newLeaf.map(() => 0),
    ];
    run.paragraphMemberPtrs = [...run.paragraphMemberPtrs, ...newMemberPtrs];
    run.paragraphMemberContainers = [
      ...run.paragraphMemberContainers,
      ...newMemberPtrs.map(() => 0),
    ];
    run.paragraphMemberFs = [...run.paragraphMemberFs, ...newMemberFs];
    run.paragraphLineHeight = lineHeight;
    run.bounds = {
      ...run.bounds,
      y: bottomBaseline - below * lineHeight - run.fontSize * 0.25,
      height: run.bounds.height + below * lineHeight,
    };
  }

  // After an undo of a partial/paragraph edit, re-register the run's live
  // PDFium objects as a flat overlay model.
  private rebuildAsOverlayModel(
    doc: EditorDocument,
    page: Page,
    run: TextRun,
    lines: RebuildLine[],
    fallbackFamily: string,
  ): void {
    const orderedLive: number[] = [];
    const lineAnchors: number[] = [];
    const anchorFs: number[] = [];
    for (const line of lines) {
      const slotLive: number[] = [];
      for (const sr of line.subRuns) {
        if (sr.removed) {
          if (!sr.text) continue;
          const ptrs = emitTextLine({
            doc,
            page,
            text: sr.text,
            x: sr.x,
            y: line.baselineY,
            fontSize: line.fontSize,
            fill: run.fill,
            ...inkFromRun(run),
            originalFontPtr: 0,
            charSpacingPt: run.charSpacingPt,
            fallbackFamily,
          });
          slotLive.push(...ptrs);
        } else if (sr.ptr) {
          slotLive.push(sr.ptr);
        }
      }
      if (slotLive.length === 0) continue;
      lineAnchors.push(slotLive[0]);
      anchorFs.push(line.baselineY);
      orderedLive.push(...slotLive);
    }
    run.mergedFromPtrs = [];
    run.mergedFromTexts = [];
    run.mergedFromBounds = [];
    run.mergedFromCharStarts = [];
    run.paragraphLineSlots = [];
    run.paragraphLeafPtrs = orderedLive;
    run.paragraphLeafContainers = orderedLive.map(() => 0);
    run.paragraphMemberPtrs = lineAnchors;
    run.paragraphMemberContainers = lineAnchors.map(() => 0);
    run.paragraphMemberFs = anchorFs;
    if (orderedLive.length > 0) run.pdfiumObjPtr = orderedLive[0];
  }

  describe(): string {
    return `Type into ${this.runId}`;
  }

  /** Consecutive typing on the SAME run coalesces into one undo step. */
  coalesceKey(): string {
    return `edit-text:${this.pageIndex}:${this.runId}`;
  }

  /** The text this edit produced - lets the history compare adjacent edits. */
  get resultText(): string {
    return this.nextText;
  }

  // True when this edit's ENTIRE delta was one or more line breaks, i.e. the
  // user pressed Enter and changed nothing else.
  private isLineBreakOnlyInsertion(): boolean {
    if (this.prevText === null) return false;
    const inserted = insertedChunk(this.prevText, this.nextText);
    return inserted !== null && /^(?:\r?\n)+$/.test(inserted);
  }

  // "Press Enter, then type" is ONE logical action, so it must cost one undo -
  // which is what makes a bare line break merge forward here.
  coalesceIgnoresTimeWindow(previous: Command | null): boolean {
    if (!(previous instanceof EditTextCommand)) return false;
    if (this.prevText === null) return false;
    // Contiguity: this edit must start from exactly what that one produced.
    if (previous.resultText !== this.prevText) return false;
    return previous.isLineBreakOnlyInsertion();
  }
}

// The text `next` adds to `prev` when the change is a pure insertion at a
// single point, or null when it is anything else.
function insertedChunk(prev: string, next: string): string | null {
  if (next.length <= prev.length) return null;
  let head = 0;
  while (head < prev.length && prev[head] === next[head]) head++;
  let tail = 0;
  while (
    tail < prev.length - head &&
    prev[prev.length - 1 - tail] === next[next.length - 1 - tail]
  ) {
    tail++;
  }
  // Everything outside the inserted chunk must be untouched original text.
  if (head + tail !== prev.length) return null;
  return next.slice(head, next.length - tail);
}

/** Keep a run's model width from claiming space past the page's right edge. */
function clampWidthToPage(x: number, width: number, page: Page): number {
  // x/width are RAW PDF space, so the right edge is the CropBox right edge in
  // raw space.
  const rawRightEdge = page.display.cropLeft + page.display.cropWidth;
  const maxWidth = Math.max(0, rawRightEdge - x);
  return Math.min(width, maxWidth);
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
    charSpacingPt: run.charSpacingPt,
  }));
}

// Reconstruct `paragraphLineSlots` from the data the overlay loop just emitted.
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
    // Empty-line slot: no PDFium sub-objects, no bounds. matrixE + baselineY
    // carry the expected anchor for the next edit.
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
    // proportion. emitTextLine emits one ptr per whitespace-separated word.
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

function cloneSlot(s: ParagraphLineSlot): ParagraphLineSlot {
  return {
    startChar: s.startChar,
    endChar: s.endChar,
    baselineY: s.baselineY,
    matrixE: s.matrixE,
    containerPtr: s.containerPtr,
    fontId: s.fontId,
    fontSize: s.fontSize,
    fontSubset: s.fontSubset,
    mergedFromPtrs: [...s.mergedFromPtrs],
    mergedFromTexts: [...s.mergedFromTexts],
    mergedFromBounds: s.mergedFromBounds.map((b) => ({ ...b })),
    mergedFromCharStarts: [...s.mergedFromCharStarts],
  };
}

function emptySlot(
  baselineY: number,
  leftX: number,
  run: TextRun,
  fallbackFamily: string,
): ParagraphLineSlot {
  return {
    startChar: 0,
    endChar: 0,
    baselineY,
    matrixE: leftX,
    containerPtr: 0,
    fontId: `base14:${fallbackFamily}`,
    fontSize: run.fontSize,
    fontSubset: false,
    mergedFromPtrs: [],
    mergedFromTexts: [],
    mergedFromBounds: [],
    mergedFromCharStarts: [],
  };
}

/** Build a slot for a freshly-emitted line, mapping each ptr to its word. */
function buildSlotForLine(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  ptrs: number[],
  text: string,
  baselineY: number,
  leftX: number,
  run: TextRun,
  fontId: string,
): ParagraphLineSlot {
  const mergedFromPtrs: number[] = [];
  const mergedFromTexts: string[] = [];
  const mergedFromBounds: Array<{ x: number; right: number }> = [];
  const mergedFromCharStarts: number[] = [];
  const words: Array<{ text: string; start: number }> = [];
  const re = /\S+/g;
  let wm: RegExpExecArray | null;
  while ((wm = re.exec(text)) !== null) {
    words.push({ text: wm[0], start: wm.index });
  }
  for (let i = 0; i < ptrs.length; i++) {
    const w = words[i];
    const b = boundsFromPtr(m, ptrs[i], leftX);
    mergedFromPtrs.push(ptrs[i]);
    mergedFromTexts.push(w ? w.text : "");
    mergedFromBounds.push({ x: b.x, right: b.right });
    mergedFromCharStarts.push(w ? w.start : text.length);
  }
  return {
    startChar: 0,
    endChar: text.length,
    baselineY,
    matrixE: leftX,
    containerPtr: 0,
    fontId,
    fontSize: run.fontSize,
    fontSubset: false,
    mergedFromPtrs,
    mergedFromTexts,
    mergedFromBounds,
    mergedFromCharStarts,
  };
}

function snapshotRunModel(run: TextRun): RunModelSnapshot {
  return {
    text: run.text,
    matrixE: run.matrix.e,
    matrixF: run.matrix.f,
    bounds: { ...run.bounds },
    paragraphLineHeight: run.paragraphLineHeight,
    paragraphMemberPtrs: [...run.paragraphMemberPtrs],
    paragraphMemberContainers: [...run.paragraphMemberContainers],
    paragraphMemberFs: [...run.paragraphMemberFs],
    paragraphLeafPtrs: [...run.paragraphLeafPtrs],
    paragraphLeafContainers: [...run.paragraphLeafContainers],
    paragraphLineSlots: run.paragraphLineSlots.map(cloneSlot),
    mergedFromPtrs: [...run.mergedFromPtrs],
    mergedFromTexts: [...run.mergedFromTexts],
    mergedFromBounds: run.mergedFromBounds.map((b) => ({ ...b })),
    mergedFromCharStarts: [...run.mergedFromCharStarts],
    fontId: run.fontId,
    fontSubset: run.fontSubset,
    pdfiumObjPtr: run.pdfiumObjPtr,
  };
}

function restoreRunModel(run: TextRun, snap: RunModelSnapshot): void {
  run.matrix = { ...run.matrix, e: snap.matrixE, f: snap.matrixF };
  run.bounds = { ...snap.bounds };
  run.paragraphLineHeight = snap.paragraphLineHeight;
  run.paragraphMemberPtrs = [...snap.paragraphMemberPtrs];
  run.paragraphMemberContainers = [...snap.paragraphMemberContainers];
  run.paragraphMemberFs = [...snap.paragraphMemberFs];
  run.paragraphLeafPtrs = [...snap.paragraphLeafPtrs];
  run.paragraphLeafContainers = [...snap.paragraphLeafContainers];
  run.paragraphLineSlots = snap.paragraphLineSlots.map(cloneSlot);
  run.mergedFromPtrs = [...snap.mergedFromPtrs];
  run.mergedFromTexts = [...snap.mergedFromTexts];
  run.mergedFromBounds = snap.mergedFromBounds.map((b) => ({ ...b }));
  run.mergedFromCharStarts = [...snap.mergedFromCharStarts];
  run.fontId = snap.fontId;
  run.fontSubset = snap.fontSubset;
  run.pdfiumObjPtr = snap.pdfiumObjPtr;
}

/** LCS over lines: maps next-line index -> matched prev-line index. */
function lineLCS(a: string[], b: string[]): Map<number, number> {
  const m = a.length;
  const n = b.length;
  const dp: Int32Array[] = new Array(m + 1);
  for (let i = 0; i <= m; i++) dp[i] = new Int32Array(n + 1);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const map = new Map<number, number>();
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      map.set(j - 1, i - 1);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return map;
}

/** Rebuild the flat leaf arrays from the run's slots. */
function reflattenLeafArrays(run: TextRun): void {
  const leaf: number[] = [];
  const leafContainers: number[] = [];
  for (const s of run.paragraphLineSlots) {
    for (const p of s.mergedFromPtrs) {
      leaf.push(p);
      leafContainers.push(s.containerPtr);
    }
  }
  run.paragraphLeafPtrs = leaf;
  run.paragraphLeafContainers = leafContainers;
}

/** Replace a restored slot (matched by baseline) with re-emitted objects. */
function patchSlotPtrsByBaseline(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  run: TextRun,
  baselineY: number,
  ptrs: number[],
  text: string,
): void {
  const idx = run.paragraphLineSlots.findIndex(
    (s) => Math.abs(s.baselineY - baselineY) < 1,
  );
  if (idx < 0) return;
  const old = run.paragraphLineSlots[idx];
  const rebuilt = buildSlotForLine(
    m,
    ptrs,
    text,
    baselineY,
    old.matrixE,
    run,
    old.fontId,
  );
  rebuilt.startChar = old.startChar;
  rebuilt.endChar = old.endChar;
  run.paragraphLineSlots[idx] = rebuilt;
}
