import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import type { RGBA } from "@app/tools/pdfTextEditor/v2/types";
import {
  applyInkState,
  collectMemberPtrs,
} from "@app/tools/pdfTextEditor/v2/commands/editTextHelpers";

/** Render modes that paint an outline; 0 is fill-only, 3 is invisible. */
const FILL_ONLY = 0;
const FILL_AND_STROKE = 2;
/** Stroke-only (1) has to fall back to fill, or clearing hides the text. */
const STROKING_MODES = new Set([1, 2]);

interface MemberInk {
  ptr: number;
  renderMode: number;
  stroke: RGBA | null;
  strokeWidth: number;
}

// Outline a run's glyphs, or clear it. Width alone is invisible, so this also
// moves the run between fill-only and fill-and-stroke render modes.
export class SetTextOutlineCommand implements Command {
  readonly type = "set-text-outline";
  private readonly pageIndex: number;
  private readonly runId: string;
  private readonly nextStroke: RGBA | null;
  private readonly nextWidth: number;
  private prev: {
    renderMode: number;
    stroke: RGBA | null;
    strokeWidth: number;
    members: MemberInk[];
  } | null = null;

  constructor(opts: {
    pageIndex: number;
    runId: string;
    /** Null clears the outline entirely. */
    stroke: RGBA | null;
    width: number;
  }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.nextStroke = opts.stroke ? { ...opts.stroke } : null;
    this.nextWidth = Math.max(0, opts.width);
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return;

    if (this.prev === null) {
      const seen = new Set<number>();
      const members: MemberInk[] = [];
      for (const ptr of collectMemberPtrs(run)) {
        if (!ptr || seen.has(ptr)) continue;
        seen.add(ptr);
        members.push(readMemberInk(doc, ptr, run));
      }
      this.prev = {
        renderMode: run.renderMode,
        stroke: run.stroke ? { ...run.stroke } : null,
        strokeWidth: run.strokeWidth,
        members,
      };
    }

    const outlined = this.nextStroke !== null && this.nextWidth > 0;
    // An invisible OCR layer stays invisible, and a clipping mode (4-7) keeps
    // clipping - changing either would alter far more than an outline.
    const preserveMode = run.renderMode === 3 || run.renderMode >= 4;
    const nextMode = preserveMode
      ? run.renderMode
      : outlined
        ? FILL_AND_STROKE
        : STROKING_MODES.has(this.prev.renderMode)
          ? FILL_ONLY
          : run.renderMode;

    run.stroke = outlined && this.nextStroke ? { ...this.nextStroke } : null;
    run.strokeWidth = outlined ? this.nextWidth : 0;
    run.renderMode = nextMode;
    run.dirty = true;
    page.markDirty();
    this.writeMembers(doc, run, nextMode);
  }

  revert(doc: EditorDocument): void {
    const snapshot = this.prev;
    if (!snapshot) return;
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return;
    run.renderMode = snapshot.renderMode;
    run.stroke = snapshot.stroke ? { ...snapshot.stroke } : null;
    run.strokeWidth = snapshot.strokeWidth;
    run.dirty = true;
    page.markDirty();
    // Each member kept its own ink, exactly as with fills: a merged line can
    // hold objects that were not all outlined the same way.
    for (const member of snapshot.members) {
      applyInkState(doc.module, [member.ptr], {
        renderMode: member.renderMode,
        stroke: member.stroke,
        strokeWidth: member.strokeWidth,
      });
      if (!member.stroke) clearStroke(doc, member.ptr);
    }
    page.markNeedsGenerate();
  }

  private writeMembers(
    doc: EditorDocument,
    run: { stroke: RGBA | null; strokeWidth: number },
    mode: number,
  ): void {
    const seen = new Set<number>();
    for (const ptr of collectMemberPtrs(run as never)) {
      if (!ptr || seen.has(ptr)) continue;
      seen.add(ptr);
      applyInkState(doc.module, [ptr], {
        renderMode: mode,
        stroke: run.stroke,
        strokeWidth: run.strokeWidth,
      });
      if (!run.stroke) clearStroke(doc, ptr);
    }
    doc.page(this.pageIndex).markNeedsGenerate();
  }

  /** One width-stepper drag must not fill the undo stack. */
  coalesceKey(): string {
    return "set-text-outline";
  }

  describe(): string {
    return `Set outline on ${this.runId}`;
  }
}

interface OutlineModule {
  FPDFPageObj_GetStrokeColor?: (
    obj: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ) => boolean;
  FPDFPageObj_GetStrokeWidth?: (obj: number, out: number) => boolean;
  FPDFPageObj_SetStrokeColor?: (
    obj: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ) => boolean;
  FPDFPageObj_SetStrokeWidth?: (obj: number, width: number) => boolean;
  FPDFTextObj_GetTextRenderMode?: (obj: number) => number;
}

function readMemberInk(
  doc: EditorDocument,
  ptr: number,
  fallback: { renderMode: number; stroke: RGBA | null; strokeWidth: number },
): MemberInk {
  const m = doc.module;
  const mod = m as unknown as OutlineModule;
  let renderMode = fallback.renderMode;
  try {
    const v = mod.FPDFTextObj_GetTextRenderMode?.(ptr);
    if (typeof v === "number" && v >= 0 && v <= 7) renderMode = v;
  } catch {
    /* keep the run-level value */
  }
  const exports = m.pdfium.wasmExports as unknown as {
    malloc: (n: number) => number;
    free: (p: number) => void;
  };
  const r = exports.malloc(4);
  const g = exports.malloc(4);
  const b = exports.malloc(4);
  const a = exports.malloc(4);
  const w = exports.malloc(4);
  try {
    let stroke: RGBA | null = null;
    if (mod.FPDFPageObj_GetStrokeColor?.(ptr, r, g, b, a)) {
      stroke = {
        r: m.pdfium.getValue(r, "i32") & 0xff,
        g: m.pdfium.getValue(g, "i32") & 0xff,
        b: m.pdfium.getValue(b, "i32") & 0xff,
        a: m.pdfium.getValue(a, "i32") & 0xff,
      };
    }
    let strokeWidth = 0;
    if (mod.FPDFPageObj_GetStrokeWidth?.(ptr, w)) {
      const raw = m.pdfium.getValue(w, "float");
      if (Number.isFinite(raw) && raw > 0) strokeWidth = raw;
    }
    return { ptr, renderMode, stroke, strokeWidth };
  } catch {
    return { ptr, renderMode, stroke: null, strokeWidth: 0 };
  } finally {
    exports.free(r);
    exports.free(g);
    exports.free(b);
    exports.free(a);
    exports.free(w);
  }
}

/** A zero-width transparent stroke is how PDFium expresses "no outline". */
function clearStroke(doc: EditorDocument, ptr: number): void {
  const mod = doc.module as unknown as OutlineModule;
  try {
    mod.FPDFPageObj_SetStrokeWidth?.(ptr, 0);
    mod.FPDFPageObj_SetStrokeColor?.(ptr, 0, 0, 0, 0);
  } catch {
    /* best-effort */
  }
}
