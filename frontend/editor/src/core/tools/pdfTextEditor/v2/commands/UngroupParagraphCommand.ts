import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import {
  cloneParagraphLineSlot,
  type ParagraphLineSlot,
  TextRun,
} from "@app/tools/pdfTextEditor/v2/model/TextRun";

/**
 * Split a paragraph-grouped run back into one editable run per source
 * line. Undoes either an auto-grouping by ParagraphGrouper or a manual
 * MergeRunsCommand. No PDFium mutation - just rebuilds the page's model.
 */
interface RepSnapshot {
  text: string;
  bounds: { x: number; y: number; width: number; height: number };
  paragraphLineHeight: number;
  paragraphMemberPtrs: number[];
  paragraphMemberContainers: number[];
  paragraphMemberFs: number[];
  paragraphLeafPtrs: number[];
  paragraphLeafContainers: number[];
  paragraphLineSlots: ParagraphLineSlot[];
}

export class UngroupParagraphCommand implements Command {
  readonly type = "ungroup-paragraph";
  private readonly pageIndex: number;
  private readonly runId: string;
  private prev: RepSnapshot | null = null;
  private createdRunIds: string[] = [];

  constructor(opts: { pageIndex: number; runId: string }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
  }

  /** Run IDs produced by the split (rep line + one per extra source line). */
  get resultRunIds(): string[] {
    return this.createdRunIds;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const rep = page.findRun(this.runId);
    if (!rep) return;
    if (rep.paragraphMemberPtrs.length < 2) return;

    this.prev = {
      text: rep.text,
      bounds: { ...rep.bounds },
      paragraphLineHeight: rep.paragraphLineHeight,
      paragraphMemberPtrs: [...rep.paragraphMemberPtrs],
      paragraphMemberContainers: [...rep.paragraphMemberContainers],
      paragraphMemberFs: [...rep.paragraphMemberFs],
      paragraphLeafPtrs: [...rep.paragraphLeafPtrs],
      paragraphLeafContainers: [...rep.paragraphLeafContainers],
      paragraphLineSlots: rep.paragraphLineSlots.map(cloneParagraphLineSlot),
    };

    const ptrs = rep.paragraphMemberPtrs;
    const fs = rep.paragraphMemberFs;
    const containers = rep.paragraphMemberContainers;
    // Prefer per-line slots: their startChar/endChar ranges split the text
    // correctly even for SOFT-wrapped paragraphs (visual lines joined by a
    // space, not "\n"). A bare "\n" split under-counts those and mis-maps
    // lines to ptrs/baselines. Fall back to "\n" only when slots are absent.
    const slots = rep.paragraphLineSlots;
    const useSlots = slots.length >= 2 && slots.length === ptrs.length;
    const lines = useSlots
      ? slots.map((s) => rep.text.slice(s.startChar, s.endChar))
      : rep.text.split(/\r?\n/);
    const n = Math.min(lines.length, ptrs.length);
    const newRuns: TextRun[] = [];
    const perLineHeight =
      rep.paragraphLineHeight > 0
        ? rep.paragraphLineHeight
        : rep.fontSize * 1.2;
    for (let i = 0; i < n; i++) {
      const baselineY = fs[i] ?? rep.matrix.f - i * perLineHeight;
      const id = `${rep.id}-line-${i}-${ptrs[i] || "stub"}`;
      const lineHeight = rep.fontSize;
      const r = new TextRun({
        id,
        pageIndex: page.index,
        pdfiumObjPtr: ptrs[i] || 0,
        bounds: {
          x: rep.bounds.x,
          y: baselineY - rep.fontSize * 0.2,
          width: rep.bounds.width,
          height: lineHeight,
        },
        matrix: { a: 1, b: 0, c: 0, d: 1, e: rep.bounds.x, f: baselineY },
        text: lines[i] ?? "",
        fontId: rep.fontId,
        fontSize: rep.fontSize,
        fill: { ...rep.fill },
        fontSubset: rep.fontSubset,
      });
      r.containerPtr = containers[i] ?? 0;
      newRuns.push(r);
    }
    this.createdRunIds = newRuns.map((r) => r.id);

    rep.paragraphMemberPtrs = [];
    rep.paragraphMemberContainers = [];
    rep.paragraphMemberFs = [];
    rep.paragraphLeafPtrs = [];
    rep.paragraphLeafContainers = [];
    rep.paragraphLineSlots = [];
    rep.paragraphLineHeight = 0;
    rep.text = lines[0] ?? "";
    rep.bounds = {
      x: rep.bounds.x,
      y: (fs[0] ?? rep.matrix.f) - rep.fontSize * 0.2,
      width: rep.bounds.width,
      height: rep.fontSize,
    };
    rep.matrix = { ...rep.matrix, f: fs[0] ?? rep.matrix.f };

    // Replace rep with rep + (n-1) new lines; the first line stays on rep.
    const tail = newRuns.slice(1);
    const idx = page.runs.findIndex((r) => r.id === rep.id);
    if (idx >= 0) {
      const next = [...page.runs];
      next.splice(idx + 1, 0, ...tail);
      page.setRuns(next);
    }
    // Bump revision so the dirty-only resnapshot republishes the page -
    // this command only mutates the in-memory run model.
    page.markDirty();
  }

  revert(doc: EditorDocument): void {
    if (!this.prev) return;
    const page = doc.page(this.pageIndex);
    const rep = page.findRun(this.runId);
    if (!rep) return;
    rep.text = this.prev.text;
    rep.bounds = { ...this.prev.bounds };
    rep.matrix = {
      ...rep.matrix,
      f: this.prev.paragraphMemberFs[0] ?? rep.matrix.f,
    };
    rep.paragraphLineHeight = this.prev.paragraphLineHeight;
    rep.paragraphMemberPtrs = [...this.prev.paragraphMemberPtrs];
    rep.paragraphMemberContainers = [...this.prev.paragraphMemberContainers];
    rep.paragraphMemberFs = [...this.prev.paragraphMemberFs];
    rep.paragraphLeafPtrs = [...this.prev.paragraphLeafPtrs];
    rep.paragraphLeafContainers = [...this.prev.paragraphLeafContainers];
    rep.paragraphLineSlots = this.prev.paragraphLineSlots.map(
      cloneParagraphLineSlot,
    );
    const tailIds = new Set(this.createdRunIds.slice(1));
    page.setRuns(page.runs.filter((r) => !tailIds.has(r.id)));
    page.markDirty();
    this.createdRunIds = [];
  }

  describe(): string {
    return `Ungroup paragraph ${this.runId}`;
  }
}
