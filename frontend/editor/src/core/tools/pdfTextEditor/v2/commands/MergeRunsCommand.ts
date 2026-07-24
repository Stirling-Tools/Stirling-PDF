import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import {
  cloneParagraphLineSlot,
  type ParagraphLineSlot,
  type TextRun,
} from "@app/tools/pdfTextEditor/v2/model/TextRun";
import {
  buildLineSlotsFromDescriptors,
  type LineSlotDescriptor,
  medianLineHeightFromBaselines,
} from "@app/tools/pdfTextEditor/v2/pdfium/ParagraphGrouper";

/**
 * Merge the selected runs on a single page into one virtual paragraph.
 *
 * The top-most run becomes the representative; the others become its
 * paragraph members. No PDFium edits happen - this only affects how the
 * editor groups the runs visually so subsequent edits treat them as one
 * block. Used when LineGrouper/ParagraphGrouper guesses wrong and the
 * user wants to force a grouping.
 */
interface RunSnapshot {
  id: string;
  pdfiumObjPtr: number;
  matrixF: number;
  containerPtr: number;
  text: string;
  paragraphLineHeight: number;
  paragraphMemberPtrs: number[];
  paragraphMemberContainers: number[];
  paragraphMemberFs: number[];
  paragraphLeafPtrs: number[];
  paragraphLeafContainers: number[];
  paragraphLineSlots: ParagraphLineSlot[];
  bounds: { x: number; y: number; width: number; height: number };
}

export class MergeRunsCommand implements Command {
  readonly type = "merge-runs";
  private readonly pageIndex: number;
  private readonly runIds: string[];
  private removedRunSnapshots: RunSnapshot[] = [];
  // The TextRun instances we removed from page.runs at apply time. Kept
  // in memory so revert can put them back without needing to re-read the
  // page from PDFium. Order is preserved so the original render order is
  // restored.
  private removedRunInstances: TextRun[] = [];
  // Original `page.runs` order at apply time so revert restores the
  // ordering callers depend on (z-order, find-bar iteration order).
  private prevRunOrder: string[] = [];
  private repPrev: RunSnapshot | null = null;
  private repId: string | null = null;

  constructor(opts: { pageIndex: number; runIds: string[] }) {
    this.pageIndex = opts.pageIndex;
    this.runIds = [...opts.runIds];
  }

  get representativeRunId(): string | null {
    return this.repId;
  }

  apply(doc: EditorDocument): void {
    if (this.runIds.length < 2) return;
    const page = doc.page(this.pageIndex);
    const runs = this.runIds
      .map((id) => page.findRun(id))
      .filter((r): r is TextRun => !!r);
    if (runs.length < 2) return;

    runs.sort((a, b) => b.matrix.f - a.matrix.f);
    const rep = runs[0];
    const members = runs.slice(1);
    this.repId = rep.id;
    this.repPrev = snapshotRun(rep);
    this.removedRunSnapshots = members.map(snapshotRun);
    this.removedRunInstances = members;
    this.prevRunOrder = page.runs.map((r) => r.id);

    // A selected run may itself be a multi-line paragraph rep, so flatten the
    // runs into ONE descriptor per visual line before building slots/members;
    // otherwise a rep's later lines (embedded "\n") collapse into one slot.
    const descs: LineDescriptor[] = [];
    for (const r of runs) descs.push(...flattenRunToLines(r));

    const minX = Math.min(...runs.map((r) => r.bounds.x));
    const maxRight = Math.max(...runs.map((r) => r.bounds.x + r.bounds.width));
    const topY = Math.max(...runs.map((r) => r.bounds.y + r.bounds.height));
    const bottomY = Math.min(...runs.map((r) => r.bounds.y));

    rep.text = descs.map((d) => d.text).join("\n");
    rep.bounds = {
      x: minX,
      y: bottomY,
      width: maxRight - minX,
      height: topY - bottomY,
    };
    // Median of consecutive per-line baseline deltas, not the rep-top-only
    // formula, so multi-line reps keep correct spacing.
    rep.paragraphLineHeight =
      descs.length > 1
        ? medianLineHeightFromBaselines(
            descs.map((d) => d.baselineY),
            rep.fontSize,
          )
        : rep.paragraphLineHeight || rep.fontSize * 1.2;
    rep.paragraphMemberPtrs = descs.map((d) => d.leafPtrs[0] ?? 0);
    rep.paragraphMemberContainers = descs.map((d) => d.containerPtr);
    rep.paragraphMemberFs = descs.map((d) => d.baselineY);
    // Flatten each line's own merged sub-ptrs so EditTextCommand removes
    // every original sub-word, not just the first ptr of each line.
    const leafPtrs: number[] = [];
    const leafContainers: number[] = [];
    for (const d of descs) {
      for (const p of d.leafPtrs) {
        leafPtrs.push(p);
        leafContainers.push(d.containerPtr);
      }
    }
    rep.paragraphLeafPtrs = leafPtrs;
    rep.paragraphLeafContainers = leafContainers;
    // Per-line slots so a later partial edit keeps each line's source font
    // (planParagraphEdit bails without them, falling back to Helvetica).
    rep.paragraphLineSlots = buildLineSlotsFromDescriptors(descs);

    const removedIds = new Set(members.map((r) => r.id));
    page.setRuns(page.runs.filter((r) => !removedIds.has(r.id)));
    // Bump the page revision so the dirty-only resnapshot in EditorStore
    // republishes this page. MergeRuns mutates only the in-memory run
    // model (no PDFium edit), so without an explicit markDirty the
    // revision wouldn't change and the merged overlay would never reach
    // the React layer.
    page.markDirty();
  }

  revert(doc: EditorDocument): void {
    if (!this.repId || !this.repPrev) return;
    const page = doc.page(this.pageIndex);
    const rep = page.findRun(this.repId);
    if (rep) restoreRun(rep, this.repPrev);

    // Re-attach the member TextRun instances we held aside at apply
    // time. Rebuild page.runs in the original order; any runs that
    // appeared on the page from unrelated work since the merge keep
    // their relative position at the tail.
    const byId = new Map<string, TextRun>();
    for (const r of page.runs) byId.set(r.id, r);
    for (const r of this.removedRunInstances) {
      if (!byId.has(r.id)) byId.set(r.id, r);
    }
    const ordered: TextRun[] = [];
    const seen = new Set<string>();
    for (const id of this.prevRunOrder) {
      const r = byId.get(id);
      if (r) {
        ordered.push(r);
        seen.add(id);
      }
    }
    for (const r of page.runs) {
      if (!seen.has(r.id)) {
        ordered.push(r);
        seen.add(r.id);
      }
    }
    page.setRuns(ordered);
    page.markDirty();
  }

  describe(): string {
    return `Merge ${this.runIds.length} runs into a paragraph`;
  }
}

// A descriptor is a slot source (mergedFrom* for the slot) plus the line's
// real leaf ptrs (which can differ from the slot fallback for single-line runs).
interface LineDescriptor extends LineSlotDescriptor {
  leafPtrs: number[];
}

/**
 * Expand a run into one descriptor per visual line. A multi-line rep (>=2
 * paragraphLineSlots) yields one descriptor per slot, slicing its text and
 * carrying the slot's own mergedFrom* arrays so the rebuilt slot is identical
 * to the original line. A single-line run yields exactly one descriptor.
 */
function flattenRunToLines(r: TextRun): LineDescriptor[] {
  if (r.paragraphLineSlots.length >= 2) {
    return r.paragraphLineSlots.map((slot) => ({
      text: r.text.slice(slot.startChar, slot.endChar),
      baselineY: slot.baselineY,
      matrixE: slot.matrixE,
      containerPtr: slot.containerPtr,
      fontId: slot.fontId,
      fontSize: slot.fontSize,
      fontSubset: slot.fontSubset,
      mergedFromPtrs: [...slot.mergedFromPtrs],
      mergedFromTexts: [...slot.mergedFromTexts],
      mergedFromBounds: slot.mergedFromBounds.map((b) => ({ ...b })),
      mergedFromCharStarts: [...slot.mergedFromCharStarts],
      leafPtrs: [...slot.mergedFromPtrs],
    }));
  }
  const leafPtrs =
    r.paragraphLeafPtrs.length > 0
      ? [...r.paragraphLeafPtrs]
      : r.mergedFromPtrs.length > 0
        ? [...r.mergedFromPtrs]
        : r.pdfiumObjPtr
          ? [r.pdfiumObjPtr]
          : [];
  // Slot sub-runs mirror buildLineSlots' single-line fallback so partial edits
  // keep the source font instead of bailing to the overlay path.
  const hasSubRuns = r.mergedFromPtrs.length > 0;
  const mergedFromPtrs = hasSubRuns
    ? [...r.mergedFromPtrs]
    : r.pdfiumObjPtr
      ? [r.pdfiumObjPtr]
      : [];
  const mergedFromTexts = hasSubRuns ? [...r.mergedFromTexts] : [r.text];
  const mergedFromBounds = hasSubRuns
    ? r.mergedFromBounds.map((b) => ({ ...b }))
    : [{ x: r.bounds.x, right: r.bounds.x + r.bounds.width }];
  const mergedFromCharStarts = hasSubRuns ? [...r.mergedFromCharStarts] : [0];
  return [
    {
      text: r.text,
      baselineY: r.matrix.f,
      matrixE: r.matrix.e,
      containerPtr: r.containerPtr,
      fontId: r.fontId,
      fontSize: r.fontSize,
      fontSubset: r.fontSubset,
      mergedFromPtrs,
      mergedFromTexts,
      mergedFromBounds,
      mergedFromCharStarts,
      leafPtrs,
    },
  ];
}

function snapshotRun(r: TextRun): RunSnapshot {
  return {
    id: r.id,
    pdfiumObjPtr: r.pdfiumObjPtr,
    matrixF: r.matrix.f,
    containerPtr: r.containerPtr,
    text: r.text,
    paragraphLineHeight: r.paragraphLineHeight,
    paragraphMemberPtrs: [...r.paragraphMemberPtrs],
    paragraphMemberContainers: [...r.paragraphMemberContainers],
    paragraphMemberFs: [...r.paragraphMemberFs],
    paragraphLeafPtrs: [...r.paragraphLeafPtrs],
    paragraphLeafContainers: [...r.paragraphLeafContainers],
    paragraphLineSlots: r.paragraphLineSlots.map(cloneParagraphLineSlot),
    bounds: { ...r.bounds },
  };
}

function restoreRun(r: TextRun, snap: RunSnapshot): void {
  r.text = snap.text;
  r.bounds = { ...snap.bounds };
  r.paragraphLineHeight = snap.paragraphLineHeight;
  r.paragraphMemberPtrs = [...snap.paragraphMemberPtrs];
  r.paragraphMemberContainers = [...snap.paragraphMemberContainers];
  r.paragraphMemberFs = [...snap.paragraphMemberFs];
  r.paragraphLeafPtrs = [...snap.paragraphLeafPtrs];
  r.paragraphLeafContainers = [...snap.paragraphLeafContainers];
  r.paragraphLineSlots = snap.paragraphLineSlots.map(cloneParagraphLineSlot);
}
