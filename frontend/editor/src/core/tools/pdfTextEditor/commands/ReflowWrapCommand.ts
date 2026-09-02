import type { Command } from "@app/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import type {
  ParagraphLineSlot,
  TextRun,
} from "@app/tools/pdfTextEditor/model/TextRun";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { readUtf16 } from "@app/services/pdfiumService";
import { rotationFromMatrix } from "@app/tools/pdfTextEditor/commands/editTextHelpers";
import { transformObject } from "@app/tools/pdfTextEditor/util/objectTransform";

/** Reflow a text run's EXISTING glyph objects to fit within `maxWidthPt`. */

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
  paragraphSoftStarts: boolean[];
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
    // Reflow math is axis-aligned (advance +x, step -y); a rotated run reads
    // along a rotated axis, so skip rather than scatter glyphs.
    if (rotationFromMatrix(run.matrix)) return;

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
    // Clamp the wrap width to the page measured from OUR OWN left edge - but
    // to the edge itself, with no margin held back. The caller's width is the
    // box the paragraph was already laid out in, so shaving a font-size margin
    // off it wraps at LESS than the document's own measure and every line
    // loses its last word: "...carry out various" drops "various" onto a line
    // of its own, on lines the user never touched.
    const rawRightEdge = page.display.cropLeft + page.display.cropWidth;
    const maxWidth = Math.min(
      this.maxWidthPt,
      Math.max(fontSize * 4, rawRightEdge - startX),
    );

    // Reflow is only NEEDED when some line actually overflows the wrap width.
    {
      const rightByLine = new Map<number, number>();
      for (const l of leaves) {
        const key = Math.round(l.baseline / 2);
        const prev = rightByLine.get(key);
        if (prev === undefined || l.right > prev) rightByLine.set(key, l.right);
      }
      let overflows = false;
      for (const right of rightByLine.values()) {
        if (right - startX > maxWidth + 0.5) {
          overflows = true;
          break;
        }
      }
      if (!overflows) return;
    }

    const words = groupWords(leaves, fontSize * 0.18);
    const spaceWidth = estimateSpaceWidth(words, fontSize);
    // The gap that FOLLOWED this word in the document, when the next word was
    // beside it on the same line. Justified text stretches its spaces line by
    // line, so rebuilding every line on one median width makes the lines that
    // were set tighter than the median come out wider than they were authored
    // - and each one then drops its last word onto a line of its own, on lines
    // the user never edited. Only a pair the reflow is genuinely joining for
    // the first time needs the estimate.
    const gapAfter = (index: number): number => {
      const a = words[index];
      const b = words[index + 1];
      if (!a || !b) return spaceWidth;
      if (Math.abs(a.baseline - b.baseline) > 2) return spaceWidth;
      const gap = b.x - a.right;
      return gap > 0 ? gap : spaceWidth;
    };
    // Manual line breaks the user typed (Enter) live in run.text as "\n".
    const hardBreaks = hardBreakNonWsCounts(run.text, run.paragraphSoftStarts);

    this.prev = snapshotRun(run);

    // Blank lines BEFORE the first word have no glyphs, so topBaseline (the
    // highest glyph) is already the first CONTENT line.
    const leadingBreaks = hardBreaks.get(0) ?? 0;
    if (leadingBreaks > 0) hardBreaks.delete(0);
    const virtualTop = topBaseline + leadingBreaks * lineHeight;
    const lines: Word[][] = [];
    const lineIsHardStart: boolean[] = [];
    for (let k = 0; k < leadingBreaks; k++) {
      lines.push([]);
      lineIsHardStart.push(true);
    }
    lines.push([]);
    // After a leading blank the content line starts at a HARD break, or the
    // rebuilt text would join the blank and the content with a space.
    lineIsHardStart.push(leadingBreaks > 0);
    let cursorX = startX;
    let lineIdx = lines.length - 1;
    let cumNonWs = 0;
    for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
      const w = words[wordIndex];
      const width = w.right - w.x;
      const wordNonWs = w.glyphs.reduce(
        (n, g) => n + g.text.replace(/\s+/g, "").length,
        0,
      );
      const breakCount = hardBreaks.get(cumNonWs) ?? 0;
      const hardBreakHere = breakCount > 0;
      // Consume the entry: a following word contributing zero non-ws chars
      // (a standalone space object) must not re-apply the same break.
      if (hardBreakHere) hardBreaks.delete(cumNonWs);
      const widthBreak =
        cursorX > startX && cursorX + width > startX + maxWidth;
      if (hardBreakHere || widthBreak) {
        // k consecutive newlines = k-1 blank lines + 1 content line; emit
        // empties so an intentional blank line survives reflow.
        for (let k = 1; k < breakCount; k++) {
          lineIdx += 1;
          lines.push([]);
          lineIsHardStart.push(true);
        }
        lineIdx += 1;
        lines.push([]);
        lineIsHardStart.push(hardBreakHere);
        cursorX = startX;
      }
      const targetX = cursorX;
      const targetBaseline = virtualTop - lineIdx * lineHeight;
      const dx = targetX - w.x;
      const dy = targetBaseline - w.baseline;
      if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
        for (const g of w.glyphs) {
          try {
            transformObject(m, g.ptr, 1, 0, 0, 1, dx, dy);
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
      cursorX = targetX + width + gapAfter(wordIndex);
      cumNonWs += wordNonWs;
    }
    // Hard breaks AFTER the last word (Enter at paragraph end) were never
    // reached by the loop, so blur silently deleted the trailing blank lines.
    const trailingBreaks = hardBreaks.get(cumNonWs) ?? 0;
    for (let k = 0; k < trailingBreaks; k++) {
      lineIdx += 1;
      lines.push([]);
      lineIsHardStart.push(true);
    }

    rebuildRunFromLines(
      run,
      lines,
      lineIsHardStart,
      startX,
      virtualTop,
      lineHeight,
      fontSize,
      this.prev.text,
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
        transformObject(m, mv.ptr, 1, 0, 0, 1, -mv.dx, -mv.dy);
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

  // Share the edit coalesce key for this run so the auto-reflow that fires on
  // blur merges into the preceding typing burst's single undo step.
  coalesceKey(): string {
    return `edit-text:${this.pageIndex}:${this.runId}`;
  }

  // The gap between the last keystroke and the blur is the user's think-time,
  // so the 600ms coalesce window must not apply here.
  coalesceIgnoresTimeWindow(): boolean {
    return true;
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

/** Group consecutive same-baseline leaves into words. */
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

/** The non-whitespace char counts at which `text` has a hard "\n" break. */
function hardBreakNonWsCounts(
  text: string,
  softStarts?: boolean[],
): Map<number, number> {
  const out = new Map<number, number>();
  let nonWs = 0;
  let lineIndex = 0;
  for (const ch of text) {
    if (ch === "\n") {
      lineIndex += 1;
      // A break this command inserted to make the text fit is not the user's,
      // so it must stay re-flowable. Reading it back as forced would freeze the
      // paragraph at whatever width it happened to be wrapped to.
      if (!softStarts?.[lineIndex]) out.set(nonWs, (out.get(nonWs) ?? 0) + 1);
    } else if (!/\s/.test(ch)) nonWs += 1;
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
  preReflowText: string,
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
  run.paragraphSoftStarts = lineIsHardStart.map((hard) => !hard);
  // ONE "\n" per visual line, wrap-created breaks included. A soft break used
  // to join with " ", which left run.text holding fewer lines than the page had
  // ink for: buildExactLines then failed at the seam (the engine trims a
  // wrapped line's trailing space, so the pen jumps backwards and the span
  // reads NaN), `exact` came back null, and the box kept its pre-edit line
  // count while the stale painted blocks were never replaced. Which breaks the
  // WRAP owns is recorded in paragraphSoftStarts instead.
  const glyphDerived = lineTexts
    .map((t, i) => (i === 0 ? t : "\n" + t))
    .join("");
  // PDFium collapses runs of intra-line spaces in the glyph stream.
  const stripWs = (s: string): string => s.replace(/\s+/g, "");
  if (
    preReflowText.length > 0 &&
    stripWs(glyphDerived) === stripWs(preReflowText)
  ) {
    const preLines = resegmentByLines(lineTexts, preReflowText);
    let cursor = 0;
    for (let i = 0; i < slots.length; i++) {
      const preLine = preLines[i] ?? "";
      slots[i].mergedFromCharStarts = slots[i].mergedFromCharStarts.map((cs) =>
        posAtNonWsIndex(preLine, nonWsLen(lineTexts[i].slice(0, cs))),
      );
      slots[i].startChar = cursor;
      slots[i].endChar = cursor + preLine.length;
      cursor += preLine.length + (i < slots.length - 1 ? 1 : 0);
    }
    run.text = preLines.map((t, i) => (i === 0 ? t : "\n" + t)).join("");
  } else {
    run.text = glyphDerived;
  }

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
    paragraphSoftStarts: [...run.paragraphSoftStarts],
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
  run.paragraphSoftStarts = [...prev.paragraphSoftStarts];
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

/** Count of non-whitespace characters in a string. */
function nonWsLen(s: string): number {
  return s.replace(/\s+/g, "").length;
}

// Position in `text` of the `idx`-th (0-based) non-whitespace char;
// `text.length` when `idx` is past the end.
function posAtNonWsIndex(text: string, idx: number): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    if (!/\s/.test(text[i])) {
      if (n === idx) return i;
      n++;
    }
  }
  return text.length;
}

// Re-segment `preReflowText` into per-visual-line texts that share the same
// non-whitespace content as `lineTexts`.
function resegmentByLines(
  lineTexts: string[],
  preReflowText: string,
): string[] {
  const out: string[] = [];
  let cumNw = 0;
  for (const lt of lineTexts) {
    const nw = nonWsLen(lt);
    if (nw === 0) {
      out.push("");
      continue;
    }
    const start = posAtNonWsIndex(preReflowText, cumNw);
    const lastPos = posAtNonWsIndex(preReflowText, cumNw + nw - 1);
    out.push(preReflowText.slice(start, lastPos + 1));
    cumNw += nw;
  }
  return out;
}
