import { liftRunToPage } from "@editor/tools/pdfTextEditor/commands/liftFromForm";
import { refuseRedrawOfReadOnlyText } from "@editor/tools/pdfTextEditor/commands/readOnlyText";
import {
  collectMemberPtrs,
  measureObjBoundsPt,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import {
  readMatrix,
  writeMatrix,
} from "@editor/tools/pdfTextEditor/commands/textPieces";
import {
  FAUX_ITALIC_SLANT,
  isFauxItalic,
  slantOf,
  withSlant,
} from "@editor/tools/pdfTextEditor/util/fauxItalic";
import i18n from "i18next";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import type { Affine, PageRect } from "@editor/tools/pdfTextEditor/types";

const SAME_SLANT = 1e-3;

interface Snapshot {
  matrix: Affine;
  bounds: PageRect;
  members: Array<{ ptr: number; matrix: Float32Array }>;
}

export class SetObliqueCommand implements Command {
  readonly type = "set-oblique";
  private readonly pageIndex: number;
  private readonly runId: string;
  private readonly slant: number;
  private prev: Snapshot | null = null;

  constructor(opts: { pageIndex: number; runId: string; oblique: boolean }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.slant = opts.oblique ? FAUX_ITALIC_SLANT : 0;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return;
    refuseRedrawOfReadOnlyText(run);
    liftRunToPage(doc, page, run);
    this.prev = slantRun(doc, page, run, this.slant);
  }

  revert(doc: EditorDocument): void {
    const snapshot = this.prev;
    if (!snapshot) return;
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return;
    for (const member of snapshot.members)
      writeMatrix(doc.module, member.ptr, member.matrix);
    run.matrix = { ...snapshot.matrix };
    run.bounds = { ...snapshot.bounds };
    run.dirty = true;
    page.markDirty();
    page.markNeedsGenerate();
  }

  describe(): string {
    return i18n.t("pdfTextEditor.commands.setOblique", "Set slant on {{run}}", {
      run: this.runId,
    });
  }
}

export class KeepObliqueCommand implements Command {
  readonly type: string;
  private readonly inner: Command;
  private readonly pageIndex: number;
  private readonly runId: string;
  private lean: SetObliqueCommand | null = null;

  constructor(inner: Command, opts: { pageIndex: number; runId: string }) {
    this.inner = inner;
    this.type = inner.type;
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
  }

  apply(doc: EditorDocument): void {
    const run = doc.page(this.pageIndex).findRun(this.runId);
    const oblique = !!run && isFauxItalic(run);
    this.inner.apply(doc);
    this.lean = oblique
      ? new SetObliqueCommand({
          pageIndex: this.pageIndex,
          runId: this.runId,
          oblique: true,
        })
      : null;
    this.lean?.apply(doc);
  }

  revert(doc: EditorDocument): void {
    this.lean?.revert(doc);
    this.lean = null;
    this.inner.revert(doc);
  }

  coalesceKey(): string | null {
    return this.inner.coalesceKey?.() ?? null;
  }

  describe(): string {
    return this.inner.describe?.() ?? this.type;
  }
}

function slantRun(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
  slant: number,
): Snapshot {
  const m = doc.module;
  const snapshot: Snapshot = {
    matrix: { ...run.matrix },
    bounds: { ...run.bounds },
    members: [],
  };
  const ptrs = [...new Set(collectMemberPtrs(run).filter((ptr) => ptr))];
  const before = measureObjBoundsPt(m, ptrs);
  for (const ptr of ptrs) {
    const matrix = readMatrix(m, ptr);
    if (!matrix) continue;
    const [a, b, c, d] = matrix;
    if (Math.abs(slantOf({ a, b, c, d }) - slant) < SAME_SLANT) continue;
    snapshot.members.push({ ptr, matrix: Float32Array.from(matrix) });
    const next = withSlant({ a, b, c, d }, slant);
    writeMatrix(
      m,
      ptr,
      Float32Array.of(next.a, next.b, next.c, next.d, matrix[4], matrix[5]),
    );
  }
  run.matrix = withSlant(run.matrix, slant);
  const after = measureObjBoundsPt(m, ptrs);
  if (before && after) run.bounds = shiftedEdges(run.bounds, before, after);
  run.dirty = true;
  page.markDirty();
  page.markNeedsGenerate();
  return snapshot;
}

function shiftedEdges(
  bounds: PageRect,
  before: { left: number; bottom: number; right: number; top: number },
  after: { left: number; bottom: number; right: number; top: number },
): PageRect {
  const left = bounds.x + after.left - before.left;
  const bottom = bounds.y + after.bottom - before.bottom;
  const right = bounds.x + bounds.width + after.right - before.right;
  const top = bounds.y + bounds.height + after.top - before.top;
  return {
    x: left,
    y: bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, top - bottom),
  };
}
