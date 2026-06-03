import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import type {
  ParagraphLineSlot,
  TextRun,
} from "@app/tools/pdfTextEditor/v2/model/TextRun";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { readUtf16 } from "@app/services/pdfiumService";

/**
 * Reflow a text run's EXISTING glyph objects to fit within `maxWidthPt`,
 * persisting the wrap by REPOSITIONING the objects rather than re-setting
 * their text.
 *
 * The naive approach - baking the visual wrap into `\n` and re-emitting each
 * line via `FPDFText_SetText` - garbles fonts whose Unicode->glyph mapping
 * isn't reliable on a re-set (the same reason the partial-edit path keeps
 * original objects instead of re-setting them). Here every original object
 * is kept and only moved, so the embedded glyphs are never disturbed.
 *
 * Geometry and text are read DIRECTLY from PDFium per object, never from the
 * run's `mergedFrom*` arrays: those record approximate bounds and a shared
 * full-string text for multi-word inserts, which would scramble the layout
 * and duplicate the reconstructed text. The line a glyph belongs to is keyed
 * off its text-matrix baseline (`f`), NOT its bounding-box bottom - bottoms
 * dip below the baseline for descenders (g, p, y) and would split them onto a
 * phantom line, scrambling the reading order.
 *
 * Algorithm:
 *   1. Read each leaf object's actual bounds (x/right) + baseline + text.
 *   2. Group consecutive same-baseline glyphs into WORDS by gap.
 *   3. Greedily place words left-to-right, wrapping when the next word would
 *      exceed `maxWidthPt`.
 *   4. Translate every glyph of a word by the same delta so the word moves as
 *      a unit and intra-word spacing is preserved.
 *   5. Rebuild `paragraphLineSlots` / `text` / member + leaf arrays.
 */

interface Leaf {
  ptr: number;
  container: number;
  text: string;
  x: number;
  right: number;
  baseline: number;
}

interface Word {
  glyphs: Leaf[];
  x: number;
  right: number;
  baseline: number;
}

interface RunSnapshot {
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
  pdfiumObjPtr: number;
}

export class ReflowWrapCommand implements Command {
  readonly type = "reflow-wrap";
  private readonly pageIndex: number;
  private readonly runId: string;
  private readonly maxWidthPt: number;
  private applied = false;
  /** Per-object translation applied, so revert can undo it exactly. */
  private moves: Array<{ ptr: number; dx: number; dy: number }> = [];
  private prev: RunSnapshot | null = null;

  constructor(opts: { pageIndex: number; runId: string; maxWidthPt: number }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.maxWidthPt = opts.maxWidthPt;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return;
    if (this.maxWidthPt <= 0) return;

    const m = doc.module;
    // Geometry + text must reflect the latest edits, and FPDFTextObj_GetText
    // reads the content stream, so flush then load a text page.
    page.flushGenerate(m);
    const textPage = m.FPDFText_LoadPage(page.pagePtr);
    let leaves: Leaf[];
    try {
      leaves = extractLeaves(m, textPage, run);
    } finally {
      m.FPDFText_ClosePage(textPage);
    }
    if (leaves.length === 0) return;

    const fontSize = run.fontSize > 0 ? run.fontSize : 12;
    const lineHeight =
      run.paragraphLineHeight > 0 ? run.paragraphLineHeight : fontSize * 1.2;
    const startX = Math.min(...leaves.map((l) => l.x));
    const topBaseline = Math.max(...leaves.map((l) => l.baseline));
    // Clamp the wrap width to the page measured from OUR OWN left edge, so
    // glyphs never spill off the right margin even if the caller's box width
    // was computed from a slightly different left (run.bounds.x vs the actual
    // leftmost glyph). One font-size of right margin keeps the last word in.
    const maxWidth = Math.min(
      this.maxWidthPt,
      Math.max(fontSize * 4, page.width - startX - fontSize),
    );

    const words = groupWords(leaves, fontSize * 0.18);
    const spaceWidth = estimateSpaceWidth(words, fontSize);
    // Manual line breaks the user typed (Enter) live in run.text as "\n".
    // The reflow must FORCE a new line at each, on top of width wrapping, or
    // a later word-wrap would re-flow straight through them and silently
    // delete the break. Keyed by non-whitespace char count so it lines up
    // with the glyph stream regardless of collapsed spaces.
    const hardBreaks = hardBreakNonWsCounts(run.text);

    this.prev = snapshotRun(run);

    const lines: Word[][] = [[]];
    const lineIsHardStart: boolean[] = [false];
    let cursorX = startX;
    let lineIdx = 0;
    let cumNonWs = 0;
    for (const w of words) {
      const width = w.right - w.x;
      const wordNonWs = w.glyphs.reduce(
        (n, g) => n + g.text.replace(/\s+/g, "").length,
        0,
      );
      const hardBreakHere = hardBreaks.has(cumNonWs);
      const widthBreak =
        cursorX > startX && cursorX + width > startX + maxWidth;
      if (hardBreakHere || widthBreak) {
        lineIdx += 1;
        lines.push([]);
        lineIsHardStart.push(hardBreakHere);
        cursorX = startX;
      }
      const targetX = cursorX;
      const targetBaseline = topBaseline - lineIdx * lineHeight;
      const dx = targetX - w.x;
      const dy = targetBaseline - w.baseline;
      if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
        for (const g of w.glyphs) {
          try {
            m.FPDFPageObj_Transform(g.ptr, 1, 0, 0, 1, dx, dy);
          } catch {
            /* best-effort - stale ptr */
          }
          this.moves.push({ ptr: g.ptr, dx, dy });
          g.x += dx;
          g.right += dx;
          g.baseline += dy;
        }
      }
      lines[lineIdx].push(w);
      cursorX = targetX + width + spaceWidth;
      cumNonWs += wordNonWs;
    }

    rebuildRunFromLines(
      run,
      lines,
      lineIsHardStart,
      startX,
      topBaseline,
      lineHeight,
      fontSize,
    );
    run.dirty = true;
    page.markDirty();
    page.markNeedsGenerate();
    this.applied = true;
  }

  revert(doc: EditorDocument): void {
    if (!this.applied || !this.prev) return;
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return;
    const m = doc.module;
    for (let i = this.moves.length - 1; i >= 0; i--) {
      const mv = this.moves[i];
      try {
        m.FPDFPageObj_Transform(mv.ptr, 1, 0, 0, 1, -mv.dx, -mv.dy);
      } catch {
        /* best-effort */
      }
    }
    this.moves = [];
    restoreRun(run, this.prev);
    run.dirty = true;
    page.markDirty();
    page.markNeedsGenerate();
    this.applied = false;
  }

  describe(): string {
    return `Wrap ${this.runId}`;
  }
}

/** Read every leaf object's ACTUAL geometry + text straight from PDFium. */
function extractLeaves(
  m: WrappedPdfiumModule,
  textPage: number,
  run: TextRun,
): Leaf[] {
  let ptrs: number[];
  let containers: number[];
  if (run.paragraphLeafPtrs.length > 0) {
    ptrs = run.paragraphLeafPtrs;
    containers = run.paragraphLeafContainers;
  } else {
    ptrs = run.mergedFromPtrs;
    containers = ptrs.map(() => run.containerPtr);
  }
  const leaves: Leaf[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < ptrs.length; i++) {
    const ptr = ptrs[i];
    if (!ptr || seen.has(ptr)) continue;
    seen.add(ptr);
    const b = readObjBounds(m, ptr);
    if (!b) continue;
    leaves.push({
      ptr,
      container: containers[i] ?? 0,
      text: readObjText(m, textPage, ptr),
      x: b.x,
      right: b.right,
      baseline: readObjBaseline(m, ptr),
    });
  }
  // Reading order: top line first (higher baseline), then left-to-right.
  leaves.sort((a, b) => {
    if (Math.abs(a.baseline - b.baseline) > 2) return b.baseline - a.baseline;
    return a.x - b.x;
  });
  return leaves;
}

/**
 * Group consecutive same-baseline leaves into words. A new word starts when
 * the baseline changes or the gap from the previous glyph exceeds
 * `gapThreshold` (an inter-word space).
 */
function groupWords(leaves: Leaf[], gapThreshold: number): Word[] {
  const words: Word[] = [];
  let cur: Leaf[] = [];
  let prev: Leaf | null = null;
  const flush = () => {
    if (cur.length === 0) return;
    words.push({
      glyphs: cur,
      x: Math.min(...cur.map((g) => g.x)),
      right: Math.max(...cur.map((g) => g.right)),
      baseline: cur[0].baseline,
    });
    cur = [];
  };
  for (const g of leaves) {
    if (prev) {
      const sameLine = Math.abs(g.baseline - prev.baseline) <= 2;
      const gap = g.x - prev.right;
      if (!sameLine || gap > gapThreshold) flush();
    }
    cur.push(g);
    prev = g;
  }
  flush();
  return words;
}

/**
 * The non-whitespace char counts at which `text` has a hard "\n" break.
 * Keyed by non-ws count (not raw index) so it aligns with the glyph stream,
 * whose whitespace may be collapsed / positional rather than literal.
 */
function hardBreakNonWsCounts(text: string): Set<number> {
  const out = new Set<number>();
  let nonWs = 0;
  for (const ch of text) {
    if (ch === "\n") out.add(nonWs);
    else if (!/\s/.test(ch)) nonWs += 1;
  }
  return out;
}

/** Median inter-word gap on the original lines; falls back to ~0.3em. */
function estimateSpaceWidth(words: Word[], fontSize: number): number {
  const gaps: number[] = [];
  for (let i = 1; i < words.length; i++) {
    const a = words[i - 1];
    const b = words[i];
    if (Math.abs(a.baseline - b.baseline) <= 2) {
      const gap = b.x - a.right;
      if (gap > 0) gaps.push(gap);
    }
  }
  if (gaps.length === 0) return fontSize * 0.3;
  gaps.sort((x, y) => x - y);
  return gaps[Math.floor(gaps.length / 2)];
}

function rebuildRunFromLines(
  run: TextRun,
  lines: Word[][],
  lineIsHardStart: boolean[],
  startX: number,
  topBaseline: number,
  lineHeight: number,
  fontSize: number,
): void {
  const slots: ParagraphLineSlot[] = [];
  const lineTexts: string[] = [];
  const leafPtrs: number[] = [];
  const leafContainers: number[] = [];
  const memberPtrs: number[] = [];
  const memberContainers: number[] = [];
  const memberFs: number[] = [];
  let cursorChar = 0;
  let maxRight = startX;

  for (let li = 0; li < lines.length; li++) {
    const lineWords = lines[li];
    const baseline = topBaseline - li * lineHeight;
    const mergedFromPtrs: number[] = [];
    const mergedFromTexts: string[] = [];
    const mergedFromBounds: Array<{ x: number; right: number }> = [];
    const mergedFromCharStarts: number[] = [];
    let lineText = "";
    for (let wi = 0; wi < lineWords.length; wi++) {
      const w = lineWords[wi];
      // Separate words on a line with a single space when neither side
      // already carries one (per-glyph runs often embed trailing spaces).
      const wText = w.glyphs.map((g) => g.text).join("");
      if (wi > 0 && !/\s$/.test(lineText) && !/^\s/.test(wText)) {
        lineText += " ";
      }
      for (const g of w.glyphs) {
        mergedFromPtrs.push(g.ptr);
        mergedFromTexts.push(g.text);
        mergedFromBounds.push({ x: g.x, right: g.right });
        mergedFromCharStarts.push(lineText.length);
        lineText += g.text;
        leafPtrs.push(g.ptr);
        leafContainers.push(g.container);
        if (g.right > maxRight) maxRight = g.right;
      }
    }
    slots.push({
      startChar: cursorChar,
      endChar: cursorChar + lineText.length,
      baselineY: baseline,
      matrixE: startX,
      containerPtr: lineWords[0]?.glyphs[0]?.container ?? run.containerPtr,
      fontId: run.fontId,
      fontSize: run.fontSize,
      fontSubset: run.fontSubset,
      mergedFromPtrs,
      mergedFromTexts,
      mergedFromBounds,
      mergedFromCharStarts,
    });
    lineTexts.push(lineText);
    cursorChar += lineText.length + 1; // +1 for "\n"
    memberPtrs.push(lineWords[0]?.glyphs[0]?.ptr ?? 0);
    memberContainers.push(
      lineWords[0]?.glyphs[0]?.container ?? run.containerPtr,
    );
    memberFs.push(baseline);
  }

  run.paragraphLineSlots = slots;
  run.paragraphLineHeight = lineHeight;
  run.paragraphMemberPtrs = memberPtrs;
  run.paragraphMemberContainers = memberContainers;
  run.paragraphMemberFs = memberFs;
  run.paragraphLeafPtrs = leafPtrs;
  run.paragraphLeafContainers = leafContainers;
  // run.text keeps ONLY the hard (user) breaks as "\n"; soft word-wraps are
  // visual (the glyph positions + slots), joined with a single space. This
  // is what lets a later edit re-flow soft wraps freely while never deleting
  // a manual line break. Every separator is exactly one char, so the slot
  // char ranges above (cursorChar += lineText.length + 1) stay aligned.
  run.text = lineTexts
    .map((t, i) => (i === 0 ? t : (lineIsHardStart[i] ? "\n" : " ") + t))
    .join("");

  const s0 = slots[0];
  if (s0) {
    run.mergedFromPtrs = [...s0.mergedFromPtrs];
    run.mergedFromTexts = [...s0.mergedFromTexts];
    run.mergedFromBounds = s0.mergedFromBounds.map((b) => ({ ...b }));
    run.mergedFromCharStarts = [...s0.mergedFromCharStarts];
    if (s0.mergedFromPtrs.length > 0) run.pdfiumObjPtr = s0.mergedFromPtrs[0];
  }

  run.matrix = { ...run.matrix, e: startX, f: topBaseline };
  run.bounds = {
    x: startX,
    y: topBaseline - (lines.length - 1) * lineHeight - fontSize * 0.25,
    width: Math.max(0, maxRight - startX),
    height: lines.length * lineHeight + fontSize * 0.25,
  };
}

function readObjBounds(
  m: WrappedPdfiumModule,
  ptr: number,
): { x: number; right: number } | null {
  const l = m.pdfium.wasmExports.malloc(4);
  const b = m.pdfium.wasmExports.malloc(4);
  const r = m.pdfium.wasmExports.malloc(4);
  const t = m.pdfium.wasmExports.malloc(4);
  try {
    if (!m.FPDFPageObj_GetBounds(ptr, l, b, r, t)) return null;
    return {
      x: m.pdfium.getValue(l, "float"),
      right: m.pdfium.getValue(r, "float"),
    };
  } catch {
    return null;
  } finally {
    m.pdfium.wasmExports.free(l);
    m.pdfium.wasmExports.free(b);
    m.pdfium.wasmExports.free(r);
    m.pdfium.wasmExports.free(t);
  }
}

/** The text-matrix baseline (translation `f`) - consistent across a line. */
function readObjBaseline(m: WrappedPdfiumModule, ptr: number): number {
  const buf = m.pdfium.wasmExports.malloc(6 * 4);
  try {
    if (!m.FPDFPageObj_GetMatrix(ptr, buf)) return 0;
    return m.pdfium.getValue(buf + 20, "float");
  } catch {
    return 0;
  } finally {
    m.pdfium.wasmExports.free(buf);
  }
}

function readObjText(
  m: WrappedPdfiumModule,
  textPage: number,
  ptr: number,
): string {
  try {
    const len = m.FPDFTextObj_GetText(ptr, textPage, 0, 0);
    if (len <= 2) return "";
    const buf = m.pdfium.wasmExports.malloc(len);
    try {
      m.FPDFTextObj_GetText(ptr, textPage, buf, len);
      return readUtf16(m, buf, len);
    } finally {
      m.pdfium.wasmExports.free(buf);
    }
  } catch {
    return "";
  }
}

function snapshotRun(run: TextRun): RunSnapshot {
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
    pdfiumObjPtr: run.pdfiumObjPtr,
  };
}

function restoreRun(run: TextRun, prev: RunSnapshot): void {
  run.text = prev.text;
  run.matrix = { ...run.matrix, e: prev.matrixE, f: prev.matrixF };
  run.bounds = { ...prev.bounds };
  run.paragraphLineHeight = prev.paragraphLineHeight;
  run.paragraphMemberPtrs = [...prev.paragraphMemberPtrs];
  run.paragraphMemberContainers = [...prev.paragraphMemberContainers];
  run.paragraphMemberFs = [...prev.paragraphMemberFs];
  run.paragraphLeafPtrs = [...prev.paragraphLeafPtrs];
  run.paragraphLeafContainers = [...prev.paragraphLeafContainers];
  run.paragraphLineSlots = prev.paragraphLineSlots.map(cloneSlot);
  run.mergedFromPtrs = [...prev.mergedFromPtrs];
  run.mergedFromTexts = [...prev.mergedFromTexts];
  run.mergedFromBounds = prev.mergedFromBounds.map((b) => ({ ...b }));
  run.mergedFromCharStarts = [...prev.mergedFromCharStarts];
  run.pdfiumObjPtr = prev.pdfiumObjPtr;
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
