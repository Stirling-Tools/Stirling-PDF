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
  rotationFromMatrix,
} from "@app/tools/pdfTextEditor/v2/commands/editTextHelpers";
import {
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

interface RevertLine {
  text: string;
  x: number;
  y: number;
  fill: { r: number; g: number; b: number; a: number };
  fontSize: number;
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

/**
 * True when a partial-edit plan only ADDED objects (no original object was
 * freed via removePtrs, none mutated in place via a "modify" op). Such an
 * apply is fully reversible by restoring the pre-edit model + deleting the
 * inserted objects - so redo can re-engage the SAME path and reproduce
 * byte-identical output (used to keep redo faithful, issue: redo-after-undo).
 */
function planIsPureInsert(plan: PartialEditPlan): boolean {
  return (
    plan.removePtrs.length === 0 && plan.ops.every((op) => op.type !== "modify")
  );
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
  /**
   * Full pre-edit model snapshot, captured by the partial / paragraph-partial
   * apply paths. When the edit only inserted objects (see planIsPureInsert),
   * revert restores this snapshot instead of flattening to an overlay model -
   * so redo re-engages the same path and reproduces identical output.
   */
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
    // No-op edit: a contentEditable insert can fire several `input` events
    // for one keystroke burst, re-dispatching the SAME final text. Re-running
    // the overlay re-emit for an unchanged string would needlessly destroy
    // and rebuild every object (flipping fonts). Nothing changed - bail.
    if (this.prevText === this.nextText) return;

    const alreadyBase14 = /^base14:/.test(run.fontId);
    // A run rotated within the page (text matrix has rotation/skew) can't use
    // the surgical partial/paragraph paths - those assume horizontal layout
    // (axis-aligned offsets, x-only kept-object shifts). Route rotated runs to
    // the full re-emit below, which is rotation-aware (rotationFromMatrix).
    const isRotated = !!rotationFromMatrix(run.matrix);

    // PARAGRAPH-AWARE PARTIAL PATH: paragraphs (multi-line runs) keep
    // per-line sub-run data in `paragraphLineSlots`. Walk each slot,
    // run the LCS path per line, keep fonts where survival is clean.
    // Bails to overlay when line count changes (typed Enter / deleted a
    // newline) or any slot's per-line plan fails.
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

    // PARAGRAPH LINE ADD/REMOVE PATH. Typing or deleting a newline changes
    // the paragraph's line count; planParagraphEdit bails on that and the
    // overlay path would re-typeset the WHOLE paragraph in a fallback font,
    // destroying the font + layout of every UNEDITED line. Instead diff the
    // lines (LCS): each unchanged line keeps its existing glyph objects
    // (translated to its new baseline, fonts intact); only new/changed lines
    // are emitted fresh. ReflowWrapCommand re-lines the paragraph on blur.
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
          // Soft-wrapped paragraph (slots != lines): can't diff per line, but
          // a pure newline-prefixed append keeps every existing object and only
          // adds the new lines at the end. A suffix that adds chars to the
          // current last line before the break falls through to the overlay.
          this.applyParagraphAppend(doc, page, run);
          run.text = this.nextText;
          run.dirty = true;
          page.markDirty();
          page.markNeedsGenerate();
          return;
        }
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
      !/\r?\n/.test(this.nextText) &&
      !isRotated
    ) {
      const partial = planPartialEdit(run, this.prevText ?? "", this.nextText);
      // An in-place "modify" op that re-SetTexts whitespace paints „ on an
      // embedded subset font with no space glyph. Skip the partial path for
      // those so the overlay re-emit (word-split, font-reused) handles it.
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
    // \r/\n are split into separate output lines (never emitted as glyphs), so
    // they must NOT gate font reuse - otherwise pressing Enter alone (which
    // adds a \n the source font never "contained") flips the whole line to
    // base-14 Helvetica even though every visible glyph is reusable.
    const safeChars = everyCharIn(
      this.nextText.replace(/[\r\n]/g, ""),
      this.prevText ?? "",
    );
    // Reusing the source font handle works when:
    //   * Every nextText char already appears in prevText (`safeChars`)
    //     - guarantees the font has a glyph for each char (it just
    //       rendered them). This holds for SUBSET fonts too: if a char was
    //       in prevText, the subset embedded a glyph for it.
    //   * The run lives at page level (FPDFPageObj_CreateTextObj only
    //     accepts page-level docPtr; form-xobject text needs a different
    //     code path that PDFium doesn't expose cleanly).
    //
    // emitTextLine validates the reused font actually renders visible glyphs
    // (measures width, falls back to base-14 on .notdef), so dropping the old
    // `!run.fontSubset` guard is safe and keeps subset/embedded fonts on edit
    // instead of always flipping to Helvetica.
    const canReuseFont = safeChars && run.containerPtr === 0;
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

    // Only stamp a cover rect when the sampler is CONFIDENT it found a uniform
    // background colour. When it isn't (gradient / image / branded region, or a
    // failed sample), bg.fill defaults to white - painting that as an opaque box
    // over a coloured or dark background is a worse, very visible artefact than
    // the residual form-xobject glyphs it would mask. So skip it when unsure.
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
    // One "line anchor" ptr per output line (first ptr emitted for that
    // line); plus any extra per-word ptrs from space preservation, kept
    // for leaf removal on subsequent edits.
    const lineAnchorPtrs: number[] = [];
    const allEmittedPtrs: number[] = [];
    // Per-line emit metadata used to rebuild paragraphLineSlots so the
    // NEXT edit can route back through paragraph-aware partial-edit
    // (font-preserving) instead of falling to overlay again forever.
    const perLineEmits: Array<{ ptrs: number[]; text: string; y: number }> = [];
    // Step each line along the run's rotated down-axis: the (0,-lineHeight)
    // stepping vector transformed by [cos,-sin] gives (sin*L, -cos*L). Upright
    // (cos=1,sin=0) reduces to (e, f-i*L), so unrotated output is unchanged.
    const rot = rotationFromMatrix(run.matrix);
    for (let i = 0; i < outputLines.length; i++) {
      const x = run.matrix.e + (rot ? i * rot.sin * lineHeight : 0);
      const y = run.matrix.f - i * lineHeight * (rot ? rot.cos : 1);
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
        x,
        y,
        fontSize: run.fontSize,
        fill: run.fill,
        originalFontPtr,
        originalFontSubset: run.fontSubset,
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

  /**
   * Exactly one revert strategy member may be set per apply. Enforced only by
   * guard ordering, so fail fast in dev if two paths ran or a member leaked.
   */
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
    // original baselines, drop the freshly-emitted new/changed lines, re-emit
    // any deleted lines, then restore the pre-edit run model.
    if (this.lineEdit) {
      for (let i = this.lineEdit.moves.length - 1; i >= 0; i--) {
        const mv = this.lineEdit.moves[i];
        try {
          m.FPDFPageObj_Transform(mv.ptr, 1, 0, 0, 1, 0, -mv.dy);
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
            originalFontPtr: 0,
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

    // Paragraph-aware partial revert: remove every per-slot insert ptr,
    // re-emit fallback chunks at each removed sub-run's original spot.
    // The original PDFium sub-objects are gone permanently (PDFium has
    // no insert-into-page-at-position API that restores byte-identical
    // glyphs) so the revert reads as the prev text in a base-14
    // fallback font - matches what the overlay-revert path does too.
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
      // object is still alive, so restore the exact pre-edit model. This lets
      // a later redo re-engage the paragraph-partial path and reproduce
      // byte-identical output instead of re-emitting via the overlay path.
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
      // Rebuild every line from the pre-edit slots: kept/modified sub-runs
      // keep their live original object; all-deleted ones are re-emitted as
      // Helvetica fallback chunks. The result is registered as the run's
      // live overlay model so a later redo/edit removes exactly these live
      // objects (never the freed originals, never orphaning the chunks).
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
      // No original objects were destroyed (pure insert, or in-place modifies
      // whose objects we just restored above): restore the EXACT pre-edit model
      // so undo keeps the original embedded fonts AND redo re-engages the
      // partial path identically. Only edits that actually freed objects fall
      // through to the Helvetica overlay rebuild below (their glyphs are gone).
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

  /**
   * Apply a paragraph edit that changed the LINE COUNT (Enter typed or a
   * newline deleted) where slots map 1:1 to lines. Diffs prev vs next lines
   * (LCS): each unchanged line keeps its existing glyph objects (translated
   * to its new baseline, font intact); new/changed lines are emitted fresh;
   * deleted lines' objects are removed. ReflowWrap re-lines on blur.
   */
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
              m.FPDFPageObj_Transform(ptr, 1, 0, 0, 1, 0, dy);
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
          originalFontPtr: 0,
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

  /**
   * Apply a paragraph edit that APPENDED lines (Enter + text at the end).
   * Keeps every existing glyph object untouched - preserving the font and
   * layout of all original text - and emits only the appended lines. The
   * subsequent ReflowWrapCommand (on blur) re-lines the whole paragraph.
   */
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
          originalFontPtr: 0,
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

  /**
   * After an undo of a partial/paragraph edit, re-register the run's live
   * PDFium objects (surviving originals + freshly re-emitted fallback
   * chunks) as a flat overlay model. Clearing the mergedFrom* / slot
   * arrays forces the next apply (redo or a fresh edit) down the overlay
   * path, which removes exactly these live objects - never the freed
   * pointers a stale partial model would reference, and never leaving the
   * re-emitted fallback chunks orphaned on the page.
   */
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
            originalFontPtr: 0,
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

  /**
   * Consecutive typing on the SAME run coalesces into one undo step. A blur
   * (ReflowWrapCommand), selection change, move, etc. are different commands
   * with no/other key, so they break the burst - giving natural undo
   * granularity (one undo per typing session, not per keystroke event).
   */
  coalesceKey(): string {
    return `edit-text:${this.pageIndex}:${this.runId}`;
  }
}

/**
 * Keep a run's model width from claiming space past the page's right edge.
 * The glyphs of a long grow-mode line can still extend right (the editing box
 * caps to the page and wraps via CSS), but the run's reported bounds must never
 * exceed the page so selection / layout logic stays on-page.
 */
function clampWidthToPage(x: number, width: number, page: Page): number {
  // x/width are RAW PDF (MediaBox) space, so the right edge is the CropBox
  // right edge in raw space (cropLeft+cropWidth); for identity pages this is
  // page.width, so the common case is unchanged.
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
