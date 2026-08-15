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
  emitRunLines,
  planLineOrigins,
  removeMemberPtrs,
} from "@app/tools/pdfTextEditor/v2/commands/editTextHelpers";
import { deviceFontEmitCount } from "@app/tools/pdfTextEditor/v2/util/deviceFontEmbed";

// Re-emit a run's text in another family: PDFium has no SetFont accessor.
// Device fonts embed when pre-warmed, else the nearest standard face.
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
    // Prefer per-line SLOT ranges: run.text joins SOFT-wrapped lines with
    // separators a \n split can't see. Baseline stepping for the fallback case
    // comes from planLineOrigins so it cannot drift from EditTextCommand's.
    const slots = run.paragraphLineSlots;
    const splitTexts = slots.length > 0 ? null : run.text.split(/\r?\n/);
    const emitLines: Array<{ text: string; x: number; y: number }> = splitTexts
      ? (() => {
          const origins = planLineOrigins(run, splitTexts.length, lineHeight);
          return splitTexts.map((text, i) => ({ text, ...origins[i] }));
        })()
      : slots.map((s) => ({
          text: run.text
            .slice(
              Math.max(0, s.startChar),
              Math.min(run.text.length, s.endChar),
            )
            .replace(/[\r\n]+$/, ""),
          x: s.matrixE,
          y: s.baselineY,
        }));
    const lineAnchors: number[] = [];
    const memberFs: number[] = [];
    const leaf: number[] = [];
    const created: number[] = [];
    // Emits with the embedded device face are counted, so the font id below
    // can say what actually rendered rather than what was requested.
    const deviceEmitsBefore = deviceFontEmitCount(doc, this.nextFamily);
    const emitted = emitRunLines({
      doc,
      page,
      run,
      lines: emitLines.map((l) => l.text),
      origins: emitLines.map((l) => ({ x: l.x, y: l.y })),
      originalFontPtr: 0, // base-14: never reuse the source font
      fallbackFamily: this.nextFamily,
    });
    for (const line of emitted) {
      memberFs.push(line.y);
      if (line.ptrs.length === 0) {
        lineAnchors.push(0);
        continue;
      }
      lineAnchors.push(line.ptrs[0]);
      leaf.push(...line.ptrs);
      created.push(...line.ptrs);
    }

    if (created.length === 0) {
      // Nothing emitted (e.g. all-whitespace dropped) - restore and bail.
      this.reinsertOriginals(m, page);
      restoreRun(run, this.prev);
      // Neutralise the command: it still lands in history, and a revert with
      // `prev` set would reinsert the originals a SECOND time.
      this.prev = null;
      return;
    }

    this.createdPtrs = created;
    run.pdfiumObjPtr = lineAnchors.find((p) => p) ?? leaf[0];
    // `device:` marks glyphs from an embedded device font; a substituted run
    // keeps `base14:`, so nothing keying off that prefix changes meaning.
    const embedded =
      deviceFontEmitCount(doc, this.nextFamily) > deviceEmitsBefore;
    run.fontId = `${embedded ? "device" : "base14"}:${this.nextFamily}`;
    run.fontSubset = false;
    // Reset ALL model bookkeeping to the freshly-emitted objects so later
    // commands act on the live objects, not the removed originals.
    run.mergedFromPtrs = [];
    run.mergedFromTexts = [];
    run.mergedFromBounds = [];
    run.mergedFromCharStarts = [];
    run.paragraphLineSlots = [];
    // Track every per-word leaf so later recolour/resize/move hit all words,
    // not just the anchor. Line height stays paragraph-only (>1 line).
    run.paragraphMemberPtrs = lineAnchors;
    run.paragraphMemberContainers = lineAnchors.map(() => 0);
    run.paragraphMemberFs = memberFs;
    run.paragraphLeafPtrs = leaf;
    run.paragraphLeafContainers = leaf.map(() => 0);
    if (emitLines.length > 1) {
      run.paragraphLineHeight = lineHeight;
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
