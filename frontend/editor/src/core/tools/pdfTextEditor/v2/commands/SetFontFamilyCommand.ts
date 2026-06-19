import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import {
  cloneParagraphLineSlot,
  type ParagraphLineSlot,
  type TextRun,
} from "@app/tools/pdfTextEditor/v2/model/TextRun";
import {
  collectContainersByPtr,
  collectMemberPtrs,
  emitTextLine,
  removeMemberPtrs,
  rotationFromMatrix,
} from "@app/tools/pdfTextEditor/v2/commands/editTextHelpers";

/**
 * Swap a text run's font to one of PDFium's base-14 standard fonts.
 *
 * Removes the existing FPDF_PAGEOBJ_TEXT object(s) and re-emits the run's text
 * in the requested base-14 family at the same position, size and fill. PDFium's
 * C API has no SetFont accessor, so re-emit is the recommended path.
 *
 * Re-emit goes through {@link emitTextLine}, which (a) emits ONE object PER
 * VISUAL LINE at descending baselines - so a multi-line paragraph keeps its
 * lines instead of collapsing onto one baseline - and (b) sanitizes the text
 * for the base-14 (WinAnsi) charset, so a non-Latin character is dropped rather
 * than persisted as a U+00FF ydieresis tofu glyph.
 *
 * Every member pointer (paragraph leaves / merged per-glyph originals) is
 * removed first; leaving them would paint the old glyphs UNDER the new font.
 */
export class SetFontFamilyCommand implements Command {
  readonly type = "set-font-family";
  private readonly pageIndex: number;
  private readonly runId: string;
  private readonly nextFamily: string;
  /** Full pre-edit model snapshot for revert. */
  private prev: RunModelSnapshot | null;
  /** Original on-page member ptrs (re-inserted on revert). */
  private prevMemberPtrs: number[];
  /** Every object this command created (removed on revert). */
  private createdPtrs: number[];

  constructor(opts: { pageIndex: number; runId: string; nextFamily: string }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.nextFamily = opts.nextFamily;
    this.prev = null;
    this.prevMemberPtrs = [];
    this.createdPtrs = [];
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return;
    const m = doc.module;

    if (this.prev === null) {
      this.prev = snapshotRun(run);
      this.prevMemberPtrs = collectMemberPtrs(run).slice();
    }

    // Detach every original object so the page stops painting them.
    removeMemberPtrs(
      m,
      page,
      this.prevMemberPtrs,
      collectContainersByPtr(run),
      run.containerPtr,
    );

    // Re-emit one base-14 object per visual line at descending baselines.
    const lineHeight =
      run.paragraphLineHeight > 0
        ? run.paragraphLineHeight
        : run.fontSize * 1.2;
    const lines = run.text.split(/\r?\n/);
    const lineAnchors: number[] = [];
    const memberFs: number[] = [];
    const leaf: number[] = [];
    const created: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const y = run.matrix.f - i * lineHeight;
      memberFs.push(y);
      if (lines[i].length === 0) {
        lineAnchors.push(0);
        continue;
      }
      const ptrs = emitTextLine({
        doc,
        page,
        text: lines[i],
        x: run.matrix.e,
        y,
        fontSize: run.fontSize,
        fill: run.fill,
        originalFontPtr: 0, // base-14: never reuse the source font
        fallbackFamily: this.nextFamily,
        // Keep the run's rotation on re-emit (no-op for upright text).
        rotation: rotationFromMatrix(run.matrix),
      });
      lineAnchors.push(ptrs[0] ?? 0);
      leaf.push(...ptrs);
      created.push(...ptrs);
    }

    if (created.length === 0) {
      // Nothing emitted (e.g. all-whitespace dropped) - restore and bail.
      this.reinsertOriginals(m, page);
      restoreRun(run, this.prev);
      return;
    }

    this.createdPtrs = created;
    run.pdfiumObjPtr = lineAnchors.find((p) => p) ?? leaf[0];
    run.fontId = `base14:${this.nextFamily}`;
    run.fontSubset = false;
    // Reset ALL model bookkeeping to the freshly-emitted objects so later
    // commands (recolor, resize, next edit) act on the live objects, not the
    // removed originals.
    run.mergedFromPtrs = [];
    run.mergedFromTexts = [];
    run.mergedFromBounds = [];
    run.mergedFromCharStarts = [];
    run.paragraphLineSlots = [];
    if (lines.length > 1) {
      run.paragraphMemberPtrs = lineAnchors;
      run.paragraphMemberContainers = lineAnchors.map(() => 0);
      run.paragraphMemberFs = memberFs;
      run.paragraphLeafPtrs = leaf;
      run.paragraphLeafContainers = leaf.map(() => 0);
      run.paragraphLineHeight = lineHeight;
    } else {
      run.paragraphMemberPtrs = [];
      run.paragraphMemberContainers = [];
      run.paragraphMemberFs = [];
      run.paragraphLeafPtrs = [];
      run.paragraphLeafContainers = [];
    }
    run.containerPtr = 0;
    run.dirty = true;
    page.markDirty();
    page.markNeedsGenerate();
  }

  revert(doc: EditorDocument): void {
    if (!this.prev) return;
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return;
    const m = doc.module;

    for (const ptr of this.createdPtrs) {
      if (!ptr) continue;
      try {
        m.FPDFPage_RemoveObject(page.pagePtr, ptr);
      } catch {
        /* best-effort */
      }
    }
    this.createdPtrs = [];
    this.reinsertOriginals(m, page);
    restoreRun(run, this.prev);
    run.dirty = true;
    page.markDirty();
    page.markNeedsGenerate();
  }

  private reinsertOriginals(
    m: import("@embedpdf/pdfium").WrappedPdfiumModule,
    page: import("@app/tools/pdfTextEditor/v2/model/Page").Page,
  ): void {
    for (const ptr of this.prevMemberPtrs) {
      if (!ptr) continue;
      try {
        m.FPDFPage_InsertObject(page.pagePtr, ptr);
      } catch {
        /* best-effort */
      }
    }
  }
}

interface RunModelSnapshot {
  text: string;
  fontId: string;
  fontSubset: boolean;
  fill: { r: number; g: number; b: number; a: number };
  pdfiumObjPtr: number;
  containerPtr: number;
  mergedFromPtrs: number[];
  mergedFromTexts: string[];
  mergedFromBounds: Array<{ x: number; right: number }>;
  mergedFromCharStarts: number[];
  paragraphMemberPtrs: number[];
  paragraphMemberContainers: number[];
  paragraphMemberFs: number[];
  paragraphLeafPtrs: number[];
  paragraphLeafContainers: number[];
  paragraphLineSlots: ParagraphLineSlot[];
  paragraphLineHeight: number;
}

function snapshotRun(run: TextRun): RunModelSnapshot {
  return {
    text: run.text,
    fontId: run.fontId,
    fontSubset: run.fontSubset,
    fill: { ...run.fill },
    pdfiumObjPtr: run.pdfiumObjPtr,
    containerPtr: run.containerPtr,
    mergedFromPtrs: [...run.mergedFromPtrs],
    mergedFromTexts: [...run.mergedFromTexts],
    mergedFromBounds: run.mergedFromBounds.map((b) => ({ ...b })),
    mergedFromCharStarts: [...run.mergedFromCharStarts],
    paragraphMemberPtrs: [...run.paragraphMemberPtrs],
    paragraphMemberContainers: [...run.paragraphMemberContainers],
    paragraphMemberFs: [...run.paragraphMemberFs],
    paragraphLeafPtrs: [...run.paragraphLeafPtrs],
    paragraphLeafContainers: [...run.paragraphLeafContainers],
    paragraphLineSlots: run.paragraphLineSlots.map(cloneParagraphLineSlot),
    paragraphLineHeight: run.paragraphLineHeight,
  };
}

function restoreRun(run: TextRun, snap: RunModelSnapshot): void {
  run.text = snap.text;
  run.fontId = snap.fontId;
  run.fontSubset = snap.fontSubset;
  run.fill = { ...snap.fill };
  run.pdfiumObjPtr = snap.pdfiumObjPtr;
  run.containerPtr = snap.containerPtr;
  run.mergedFromPtrs = [...snap.mergedFromPtrs];
  run.mergedFromTexts = [...snap.mergedFromTexts];
  run.mergedFromBounds = snap.mergedFromBounds.map((b) => ({ ...b }));
  run.mergedFromCharStarts = [...snap.mergedFromCharStarts];
  run.paragraphMemberPtrs = [...snap.paragraphMemberPtrs];
  run.paragraphMemberContainers = [...snap.paragraphMemberContainers];
  run.paragraphMemberFs = [...snap.paragraphMemberFs];
  run.paragraphLeafPtrs = [...snap.paragraphLeafPtrs];
  run.paragraphLeafContainers = [...snap.paragraphLeafContainers];
  run.paragraphLineSlots = snap.paragraphLineSlots.map(cloneParagraphLineSlot);
  run.paragraphLineHeight = snap.paragraphLineHeight;
}
