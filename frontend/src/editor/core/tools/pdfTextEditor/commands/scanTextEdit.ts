import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  applyVector,
  moveAllObjects,
  scanFrameFor,
  type ScanFrame,
} from "@editor/tools/pdfTextEditor/commands/scanFrame";
import { median } from "@editor/tools/pdfTextEditor/util/median";
import { BLACK, WHITE, luma } from "@editor/tools/pdfTextEditor/model/Color";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import {
  RENDER_MODE_INVISIBLE,
  type Affine,
  type RGBA,
} from "@editor/tools/pdfTextEditor/types";
import {
  composeAffine,
  invertAffine,
  transformRectAABB,
} from "@editor/tools/pdfTextEditor/model/affine";
import {
  capturePatch,
  measureScanInk,
  sampleBackground,
  type PixelPatch,
} from "@editor/tools/pdfTextEditor/pdfium/BackgroundSampler";
import {
  inkBesideOcr,
  lineExtent,
  lineRegion,
  type PlacedWord,
} from "@editor/tools/pdfTextEditor/commands/scanOffInk";
import {
  layoutScanEdit,
  rewrapLines,
  type LayoutWord,
} from "@editor/tools/pdfTextEditor/commands/scanLayout";
import {
  emitFillRect,
  removeAndDestroyObject,
  removeMemberPtrs,
  recordUndrawableChars,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import {
  FIT_PAUSED,
  blurRgba,
  checkDeadline,
  fitFace,
  placeText,
  spanOf,
  toInkOnly,
  withFitDeadline,
} from "@editor/tools/pdfTextEditor/commands/scanStyle";
import {
  inkTop,
  preferredScanFace,
  preferredStyle,
  rankStyles,
  withPreferredFace,
  type FitInput,
  type FitWord,
  type RankedStyle,
  type ScanStyle,
  type SpanInk,
} from "@editor/tools/pdfTextEditor/commands/scanFit";
import {
  drawFromAtlas,
  drawInFont,
  emitSearchable,
  invisibleText,
  pasteImage,
  wordGap,
  type Canvas,
} from "@editor/tools/pdfTextEditor/commands/scanPaint";
import {
  COURIER,
  HELVETICA,
  faceCovers,
  scanFaces,
  scanFacesGeneration,
  type Face,
} from "@editor/tools/pdfTextEditor/util/scanFontLibrary";
import {
  buildGlyphAtlas,
  composeText,
  type ComposedText,
  type GlyphAtlas,
  type ScannedWord,
} from "@editor/tools/pdfTextEditor/commands/scanGlyphs";
import { readMatrix } from "@editor/tools/pdfTextEditor/commands/textPieces";

// Editing OCR text on a scanned page. The words live twice: as pixels in the
// scan and as invisible (Tr 3) text. An edit draws only the words the user
// typed; every other word stays the scan's own pixels (moved if it has to make
// room), so OCR misreads never reach the page.

const REFERENCE_CHARS = 72;

interface ScanWord {
  text: string;
  /** Char offset of the word within its line. */
  start: number;
  x: number;
  right: number;
  baseline: number;
  ptr: number;
  extraPtrs?: number[];
  container: number;
  fontSize: number;
}

interface ScanLine {
  text: string;
  baseline: number;
  /** OCR's glyph box height above the baseline. */
  height: number;
  words: ScanWord[];
}

/** A move or restyle the user applied to the whole block. */
export interface ScanOverride {
  dx: number;
  dy: number;
  family?: string;
  fontSize?: number;
  fill?: RGBA;
  style?: ScanStyle;
}

export interface ScanEditState {
  lines: ScanLine[];
  fontPtr: number;
  /** Covers and visible text currently on the page. */
  created: number[];
  /** Visible text only, a subset of `created`. */
  textPtrs: number[];
  /** "line:word" keys of original words currently lifted off the page. */
  lifted: Set<string>;
  inks: Map<string, SpanInk | null>;
  /** Scanned pixels of words, copied for moving them. */
  patches: Map<string, PixelPatch | null>;
  override: ScanOverride;
  /** The block's style, and its glyph height above the baseline. */
  block?: {
    style: ScanStyle;
    top: number;
    xHeight: number | null;
    ranked: RankedStyle[];
    ref: SpanInk;
    preferred: string | null;
    drawn?: boolean;
  } | null;
  undrawableWithFaces?: number;
  /** Styles for text in the block that the scan sets at another size. */
  classes: Array<{ style: ScanStyle; top: number }>;
  face?: Face | null;
  nearbyFace?: Face | null;
  neighbours?: PlacedWord[];
  atlas?: GlyphAtlas | null;
  atlasChars?: Set<string>;
  frame?: ScanFrame;
  upright?: boolean;
  offScan?: boolean;
  offInk?: boolean;
  edited?: boolean;
  typedFromScan?: boolean;
}

export function isScanRun(run: { renderMode?: number }): boolean {
  return run.renderMode === RENDER_MODE_INVISIBLE;
}

function emptyState(lines: ScanLine[], fontPtr: number): ScanEditState {
  return {
    lines,
    fontPtr,
    created: [],
    textPtrs: [],
    lifted: new Set(),
    inks: new Map(),
    patches: new Map(),
    override: { dx: 0, dy: 0 },
    classes: [],
  };
}

function runWords(run: TextRun) {
  return {
    ptrs: run.mergedFromPtrs.length ? run.mergedFromPtrs : [run.pdfiumObjPtr],
    texts: run.mergedFromTexts.length ? run.mergedFromTexts : [run.text],
    starts: run.mergedFromCharStarts.length ? run.mergedFromCharStarts : [0],
    bounds: run.mergedFromBounds.length
      ? run.mergedFromBounds
      : [{ x: run.bounds.x, right: run.bounds.x + run.bounds.width }],
  };
}

function fontOf(m: WrappedPdfiumModule, ptr: number): number {
  try {
    return m.FPDFTextObj_GetFont(ptr);
  } catch {
    return 0;
  }
}

const affineOf = (v: Float32Array): Affine => ({
  a: v[0],
  b: v[1],
  c: v[2],
  d: v[3],
  e: v[4],
  f: v[5],
});

function pageMatrixReader(
  m: WrappedPdfiumModule,
  run: TextRun,
): (ptr: number, container: number) => Affine | null {
  const runOwn = run.containerPtr ? readMatrix(m, run.pdfiumObjPtr) : null;
  const form = runOwn
    ? composeAffine(run.matrix, invertAffine(affineOf(runOwn)))
    : null;
  return (ptr, container) => {
    if (container !== 0 && (container !== run.containerPtr || !form))
      return null;
    const own = readMatrix(m, ptr);
    if (!own) return null;
    return form ? composeAffine(form, affineOf(own)) : affineOf(own);
  };
}

function captureRotatedScanEdit(
  m: WrappedPdfiumModule,
  run: TextRun,
  frame: ScanFrame,
): ScanEditState | null {
  if (run.text.includes("\n")) return null;
  const { ptrs, texts, starts } = runWords(run);
  if (texts.length !== ptrs.length || starts.length !== ptrs.length)
    return null;
  const baseline = composeAffine(frame.toUpright, run.matrix).f;
  const box = transformRectAABB(frame.toUpright, run.bounds);
  const length = Math.max(1, run.text.trimEnd().length);
  const pageMatrix = pageMatrixReader(m, run);
  const words: ScanWord[] = ptrs.map((ptr, w) => {
    const start = starts[w];
    const end = start + texts[w].trimEnd().length;
    const own = pageMatrix(ptr, run.containerPtr);
    return {
      text: texts[w],
      start,
      x: box.x + (box.width * start) / length,
      right: box.x + (box.width * Math.min(end, length)) / length,
      baseline: own ? composeAffine(frame.toUpright, own).f : baseline,
      ptr,
      container: run.containerPtr,
      fontSize: run.fontSize,
    };
  });
  const line = {
    text: run.text,
    baseline,
    height: Math.max(2, box.y + box.height - baseline),
    words,
  };
  return { ...emptyState([line], fontOf(m, ptrs[0])), frame };
}

// Snapshot a run's OCR words. Null when the run carries no per-word geometry,
// which leaves the caller on the whole-run rewrite.
export function captureScanEdit(
  m: WrappedPdfiumModule,
  run: TextRun,
  page?: Page,
): ScanEditState | null {
  const frame = page ? scanFrameFor(page, run.matrix, run.bounds) : null;
  if (frame) return captureRotatedScanEdit(m, run, frame);
  const texts = run.text.split("\n");
  const own = runWords(run);
  const slots =
    run.paragraphLineSlots.length === texts.length
      ? run.paragraphLineSlots
      : texts.length === 1
        ? [
            {
              baselineY: run.matrix.f,
              containerPtr: run.containerPtr,
              fontSize: run.fontSize,
              mergedFromPtrs: own.ptrs,
              mergedFromTexts: own.texts,
              mergedFromBounds: own.bounds,
              mergedFromCharStarts: own.starts,
            },
          ]
        : null;
  if (!slots) return null;
  const top = run.bounds.y + run.bounds.height;
  const height = Math.max(2, top - slots[0].baselineY);
  const lines: ScanLine[] = [];
  const pageMatrix = pageMatrixReader(m, run);
  for (const [i, s] of slots.entries()) {
    const n = s.mergedFromPtrs.length;
    if (
      n === 0 ||
      s.mergedFromTexts.length !== n ||
      s.mergedFromBounds.length !== n ||
      s.mergedFromCharStarts.length !== n ||
      s.mergedFromPtrs.some((p) => !p)
    )
      return null;
    const container = s.containerPtr || run.containerPtr;
    lines.push({
      text: texts[i],
      baseline: s.baselineY,
      height,
      words: s.mergedFromPtrs.map((ptr, w) => ({
        text: s.mergedFromTexts[w],
        start: s.mergedFromCharStarts[w],
        x: s.mergedFromBounds[w].x,
        right: s.mergedFromBounds[w].right,
        baseline: pageMatrix(ptr, container)?.f ?? s.baselineY,
        ptr,
        container,
        fontSize: s.fontSize,
      })),
    });
  }
  return emptyState(lines, fontOf(m, lines[0].words[0].ptr));
}

/** Where word `w` of a line ends in the line's text, its trailing space included. */
function wordEnd(line: ScanLine, w: number): number {
  return w + 1 < line.words.length ? line.words[w + 1].start : line.text.length;
}

const wordsOf = (lines: ScanLine[]): FitWord[] =>
  lines
    .flatMap((l) => l.words)
    .map((w) => ({ text: w.text, width: w.right - w.x }));

function faceFor(
  doc: EditorDocument,
  page: Page,
  state: ScanEditState,
): Face | null {
  if (state.face === undefined)
    state.face = fitFace(doc, page, wordsOf(state.lines));
  return state.face;
}

// Too few words of its own: borrow from the nearest scanned runs whose text
// is about as tall, which on a form is usually the same typewriter or label.
function nearbyFace(
  doc: EditorDocument,
  page: Page,
  state: ScanEditState,
): Face | null {
  if (state.nearbyFace !== undefined) return state.nearbyFace;
  if (state.frame) return (state.nearbyFace = null);
  const own = state.lines[0];
  const pooled: FitWord[] = [];
  const others = page.runs
    .filter((r) => isScanRun(r) && r.scanEdit !== state)
    .map((run) => ({
      run,
      height: (run.bounds.height / run.text.split("\n").length) * 0.9,
      dist:
        Math.abs(run.matrix.f - own.baseline) +
        Math.abs(run.bounds.x - own.words[0].x) / 4,
    }))
    .filter((o) => o.height / own.height > 0.75 && o.height / own.height < 1.33)
    .sort((p, q) => p.dist - q.dist);
  for (const { run } of others) {
    const { texts, bounds } = runWords(run);
    texts.forEach((t, i) =>
      pooled.push({ text: t, width: bounds[i].right - bounds[i].x }),
    );
    if (pooled.filter((w) => w.text.trim().length >= 2).length >= 8) break;
  }
  state.nearbyFace = fitFace(doc, page, pooled);
  return state.nearbyFace;
}

// OCR words of every other scanned run on the page.
function otherWords(page: Page, state: ScanEditState): PlacedWord[] {
  if (state.neighbours) return state.neighbours;
  const out: PlacedWord[] = [];
  for (const run of page.runs) {
    if (!isScanRun(run) || run.scanEdit === state) continue;
    if (state.frame) {
      const box = transformRectAABB(state.frame.toUpright, run.bounds);
      const turned = composeAffine(state.frame.toUpright, run.matrix);
      if (Math.abs(turned.b) > 1e-6 || turned.a <= 0) continue;
      out.push({ x: box.x, right: box.x + box.width, baseline: turned.f });
      continue;
    }
    const slots = run.paragraphLineSlots.length
      ? run.paragraphLineSlots
      : [{ baselineY: run.matrix.f, mergedFromBounds: runWords(run).bounds }];
    for (const s of slots)
      for (const b of s.mergedFromBounds)
        out.push({ x: b.x, right: b.right, baseline: s.baselineY });
  }
  state.neighbours = out;
  return out;
}

// Where words from..to of a line really are on the scan. Cached: the scan
// under a span never changes, only what is drawn over it.
function spanInk(
  doc: EditorDocument,
  page: Page,
  state: ScanEditState,
  li: number,
  from: number,
  to: number,
): SpanInk | null {
  const key = `${li}:${from}:${to}`;
  if (state.inks.has(key)) return state.inks.get(key) ?? null;
  const line = state.lines[li];
  const words = line.words;
  const prev = words[from - 1];
  const next = words[to + 1];
  const own = words.slice(from, to + 1).map((w) => w.baseline);
  const low = Math.min(...own);
  const high = Math.max(...own);
  const mid = (low + high) / 2;
  // Stay clear of the neighbouring words' ink, however close they sit.
  let x0 = prev ? (prev.right + words[from].x) / 2 : words[from].x - 2;
  let x1 = next ? (words[to].right + next.x) / 2 : words[to].right + 2;
  // OCR word boxes can overrun into words the OCR put in another block.
  for (const w of otherWords(page, state)) {
    if (Math.abs(w.baseline - mid) > line.height * 0.5) continue;
    if (w.x > words[to].x + 0.5) x1 = Math.min(x1, w.x - 0.3);
    if (w.right < words[from].x + 0.5) x0 = Math.max(x0, w.right + 0.3);
  }
  checkDeadline();
  const ink = measureScanInk(
    doc.module,
    page,
    lineRegion(x0, x1, low, high, line.height),
  );
  let result: SpanInk | null = null;
  if (ink) {
    // OCR reads a box edge hugging the text as a bracket or bar.
    const raw = line.text.slice(words[from].start, wordEnd(line, to)).trim();
    const dropLead = ink.edgeLeft && /^[[|(]/.test(raw);
    const dropTrail = ink.edgeRight && /[\]|)]$/.test(raw);
    result = {
      ink,
      paper: ink.paper,
      baseline:
        ink.baseline !== null &&
        Math.abs(ink.baseline - mid) < line.height * 0.4
          ? ink.baseline
          : mid,
      original: raw.slice(dropLead ? 1 : 0, dropTrail ? -1 : undefined),
      dropLead,
      dropTrail,
    };
  }
  state.inks.set(key, result);
  return result;
}

const lineInk = (
  doc: EditorDocument,
  page: Page,
  state: ScanEditState,
  li: number,
) => spanInk(doc, page, state, li, 0, state.lines[li].words.length - 1);

function inkedLines(doc: EditorDocument, page: Page, state: ScanEditState) {
  return state.lines
    .map((_, li) => ({ li, ink: lineInk(doc, page, state, li) }))
    .filter(
      (l): l is { li: number; ink: SpanInk } =>
        l.ink !== null && l.ink.original.length > 0,
    );
}

function offInk(doc: EditorDocument, page: Page, state: ScanEditState) {
  state.offInk ??= onOriginalScan(doc, page, state, () => {
    const lines = state.lines.filter((l) => l.words.length > 0);
    if (lines.length === 0 || inkedLines(doc, page, state).length > 0)
      return false;
    return inkBesideOcr(doc, page, lines, otherWords(page, state));
  });
  return state.offInk;
}

const fitInput = (
  doc: EditorDocument,
  page: Page,
  state: ScanEditState,
  spans: SpanInk[],
  ref: SpanInk,
): FitInput => ({
  spans,
  ref,
  words: wordsOf(state.lines),
  wordsLookMono: () => faceFor(doc, page, state) === COURIER,
  neighboursLookMono: () => nearbyFace(doc, page, state) === COURIER,
});

const rank = (
  doc: EditorDocument,
  page: Page,
  state: ScanEditState,
  spans: SpanInk[],
  ref: SpanInk,
) => rankStyles(doc, page, fitInput(doc, page, state, spans, ref));

function fittedForOtherPreference(
  doc: EditorDocument,
  state: ScanEditState,
): boolean {
  const block = state.block;
  if (!block || block.drawn) return false;
  const preferred = preferredScanFace(doc);
  return (
    preferred !== null &&
    block.preferred !== preferred &&
    !block.ranked.some((r) => r.face.label === preferred)
  );
}

const undrawableWithFewerFaces = (state: ScanEditState) =>
  state.block === null && state.undrawableWithFaces !== scanFacesGeneration();

export function scanRunNeedsFit(doc: EditorDocument, run: TextRun): boolean {
  if (!isScanRun(run)) return false;
  const state = run.scanEdit;
  return (
    !state ||
    state.block === undefined ||
    undrawableWithFewerFaces(state) ||
    fittedForOtherPreference(doc, state)
  );
}

export function prefitScanRun(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
  deadline: number,
): boolean {
  const state = isScanRun(run) ? scanEditOf(doc, run) : null;
  if (!state || !scanRunNeedsFit(doc, run)) return true;
  try {
    withFitDeadline(deadline, () =>
      upright(doc, page, state, () => styleFor(doc, page, state, null)),
    );
    return true;
  } catch (e) {
    if (e === FIT_PAUSED) return false;
    throw e;
  }
}

function referenceSpan(
  doc: EditorDocument,
  page: Page,
  state: ScanEditState,
  line: { li: number; ink: SpanInk },
): SpanInk {
  if (line.ink.original.length <= REFERENCE_CHARS) return line.ink;
  const words = state.lines[line.li].words;
  let last = 0;
  while (
    last + 1 < words.length &&
    wordEnd(state.lines[line.li], last + 1) <= REFERENCE_CHARS
  )
    last++;
  if (last < 2) return line.ink;
  return spanInk(doc, page, state, line.li, 0, last) ?? line.ink;
}

function fitBlock(
  doc: EditorDocument,
  page: Page,
  state: ScanEditState,
): ScanEditState["block"] {
  const inked = inkedLines(doc, page, state);
  if (inked.length === 0) return null;
  const spans = inked.map((l) => l.ink);
  const longest = inked.reduce((p, q) =>
    q.ink.original.length > p.ink.original.length ? q : p,
  );
  const ref = referenceSpan(doc, page, state, longest);
  const ranked = rank(doc, page, state, spans, ref);
  if (ranked.length === 0) return null;
  const xHeights = spans.flatMap((s) =>
    s.ink.xLine === null ? [] : [s.ink.xLine - s.baseline],
  );
  return {
    style: ranked[0].style,
    top: median(spans.map(inkTop)),
    xHeight: xHeights.length ? median(xHeights) : null,
    ranked,
    ref,
    preferred: preferredScanFace(doc),
  };
}

function withPreferredFit(
  doc: EditorDocument,
  page: Page,
  state: ScanEditState,
  block: NonNullable<ScanEditState["block"]>,
): ScanEditState["block"] {
  const spans = inkedLines(doc, page, state).map((l) => l.ink);
  const input = fitInput(doc, page, state, spans, block.ref);
  return {
    ...block,
    ranked: withPreferredFace(doc, page, input, block.ranked),
    preferred: preferredScanFace(doc),
  };
}

export function drawnBlockStyle(
  doc: EditorDocument,
  state: ScanEditState,
): ScanStyle | null {
  const block = state.block;
  if (!block) return null;
  if (block.drawn) return block.style;
  return preferredStyle(doc, block.ranked) ?? block.style;
}

const X_HEIGHT_ONLY = /^[acemnorsuvwxz\s\p{P}]+$/u;

// One style for the whole block, fitted to its longest line, so an edit never
// switches face or size part way through a sentence. Only text the scan itself
// sets at another size (a label and its value on one OCR line) gets its own.
function styleFor(
  doc: EditorDocument,
  page: Page,
  state: ScanEditState,
  span: SpanInk | null,
): ScanStyle | null {
  return onOriginalScan(doc, page, state, () =>
    styleOnScan(doc, page, state, span),
  );
}

function styleOnScan(
  doc: EditorDocument,
  page: Page,
  state: ScanEditState,
  span: SpanInk | null,
): ScanStyle | null {
  if (undrawableWithFewerFaces(state)) state.block = undefined;
  if (state.block === undefined) {
    state.block = fitBlock(doc, page, state);
    if (state.block === null) state.undrawableWithFaces = scanFacesGeneration();
  }
  if (state.block && fittedForOtherPreference(doc, state))
    state.block = withPreferredFit(doc, page, state, state.block);
  const block = state.block;
  const blockStyle = drawnBlockStyle(doc, state);
  if (!block || !blockStyle) return null;
  if (!span) return blockStyle;
  const top = inkTop(span);
  const near = (t: number) => Math.abs(top / t - 1) < 0.25;
  if (near(block.top)) return blockStyle;
  if (
    block.xHeight !== null &&
    X_HEIGHT_ONLY.test(span.original) &&
    near(block.xHeight)
  )
    return blockStyle;
  const known = state.classes.find((c) => near(c.top));
  if (known) return known.style;
  const ranked = rank(doc, page, state, [span], span);
  if (ranked.length === 0) return block.style;
  const style = block.drawn
    ? ranked[0].style
    : (preferredStyle(doc, ranked) ?? ranked[0].style);
  state.classes.push({ style, top });
  return style;
}

/** Baseline-to-baseline distance in the block, for lines added below it. */
function linePitch(state: ScanEditState, style: ScanStyle): number {
  const gaps = state.lines
    .slice(1)
    .map((l, i) => state.lines[i].baseline - l.baseline)
    .filter((g) => g > 0);
  return gaps.length ? median(gaps) : style.fontSize * 1.25;
}

/** Typical gap between neighbouring words in the block. */
function wordSpace(state: ScanEditState, style: ScanStyle): number {
  const gaps = state.lines.flatMap((l) =>
    l.words
      .slice(1)
      .map((w, i) => w.x - l.words[i].right)
      .filter((g) => g > 0),
  );
  return gaps.length ? median(gaps) : style.fontSize * 0.28;
}

function fallbackStyle(
  state: ScanEditState,
  ink = BLACK,
  text = state.lines.map((l) => l.text).join(" "),
): ScanStyle {
  const face = scanFaces().find((f) => faceCovers(f, text)) ?? HELVETICA;
  return {
    family: face.family,
    fontSize: state.lines[0].height / (face.cap / 1000),
    stretch: 1,
    ink,
    weight: 0,
    hollow: 0,
    softness: 0,
  };
}

function inkAgainst(
  m: WrappedPdfiumModule,
  page: Page,
  state: ScanEditState,
): RGBA {
  const line = state.lines[0];
  const { x0, x1 } = lineExtent(line);
  const { fill } = sampleBackground(m, page, {
    x: x0,
    y: line.baseline - line.height * 0.2,
    width: x1 - x0,
    height: line.height * 1.2,
  });
  return luma(fill.r, fill.g, fill.b) < 128 ? WHITE : BLACK;
}

// The scanned pixels of one word, copied once: the scan under a word never
// changes, only what is drawn over it.
function patchOf(
  doc: EditorDocument,
  page: Page,
  state: ScanEditState,
  key: string,
  ink: SpanInk,
): PixelPatch | null {
  if (!state.patches.has(key))
    state.patches.set(key, capturePatch(doc.module, page, ink.ink.rect));
  return state.patches.get(key) ?? null;
}

function atlasOf(
  doc: EditorDocument,
  page: Page,
  state: ScanEditState,
  needed: Set<string>,
): GlyphAtlas | null {
  const known = state.atlasChars ?? new Set<string>();
  if (state.atlas !== undefined && [...needed].every((ch) => known.has(ch)))
    return state.atlas;
  const chars = new Set([...known, ...needed]);
  const top = state.block?.top ?? state.lines[0].height;
  const pitch =
    state.lines.length > 1 ? linePitch(state, fallbackStyle(state)) : Infinity;
  const descent = top * 0.35;
  const frame = Math.min(top * 1.45, pitch * 0.95);
  const words: ScannedWord[] = [];
  state.lines.forEach((line, li) =>
    line.words.forEach((word, wi) => {
      if (![...word.text].some((ch) => chars.has(ch))) return;
      const span = spanInk(doc, page, state, li, wi, wi);
      if (!span || inkTop(span) > top * 1.3) return;
      const patch = capturePatch(doc.module, page, {
        x: span.ink.rect.x,
        y: span.baseline - descent,
        width: span.ink.rect.width,
        height: frame,
      });
      if (!patch) return;
      toInkOnly(patch, span.paper, span.ink.reversed);
      words.push({
        text: span.original.replace(/\s+/g, ""),
        rgba: patch.rgba,
        width: patch.width,
        height: patch.height,
        left: patch.rect.x,
        scale: patch.width / patch.rect.width,
        spans: span.ink.glyphSpans,
      });
    }),
  );
  state.atlas = buildGlyphAtlas(words, descent);
  state.atlasChars = chars;
  return state.atlas;
}

function styleCovers(style: ScanStyle, text: string): boolean {
  const face = scanFaces().find(
    (f) => f.family === style.family || f.bold === style.family,
  );
  return !face || faceCovers(face, text);
}

function implausibleLine(line: ScanLine): boolean {
  const chars = line.text.replace(/\s/g, "").length;
  if (chars <= 3 || line.words.length === 0) return false;
  const { x0, x1 } = lineExtent(line);
  return x1 - x0 < chars * line.height * 0.15;
}

function extraSpacesBefore(line: ScanLine, w: ScanWord, index: number) {
  const upTo = w.start + w.text.length - w.text.trimStart().length;
  const before = line.text.slice(0, upTo);
  const spaces = before.length - before.trimEnd().length;
  return Math.max(0, spaces - (index === 0 ? 0 : 1));
}

const UNSHAPED_SCRIPT =
  /[\u0590-\u08ff\u0d00-\u0d7f\u0f00-\u0fff\ufb1d-\ufdff\ufe70-\ufeff]/u;

function keepsOnlyScannedWords(state: ScanEditState, text: string): boolean {
  const words = state.lines
    .flatMap((l) => l.words.map((w) => w.text.trim()))
    .filter(Boolean);
  let i = 0;
  return text
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => {
      while (i < words.length && words[i] !== token) i++;
      return i++ < words.length;
    });
}

// Make the page show `text` for this run. Words the user kept stay the scan's
// own pixels, moved as a copy when something before them changed width or
// wrapped; typed words are drawn in the block's style; removed ones covered.
export function renderScanEdit(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
  state: ScanEditState,
  text: string,
): boolean {
  const drawn = upright(doc, page, state, () =>
    renderUprightScanEdit(doc, page, run, state, text),
  );
  if (drawn && state.block && !state.block.drawn)
    state.block = {
      ...state.block,
      style: preferredStyle(doc, state.block.ranked) ?? state.block.style,
      drawn: true,
    };
  return drawn;
}

interface EditStyles {
  blockFit: () => ScanStyle | null;
  fitted: () => ScanStyle;
  /** The fitted block style if anything has asked for it yet, without fitting. */
  fittedSoFar: () => ScanStyle | undefined;
  styleOf: (anchor: LayoutWord | null) => ScanStyle;
  inkOf: (w: LayoutWord) => SpanInk | null;
}

function anchorBase(
  o: ScanOverride,
  own: ScanStyle,
  blockStyle: ScanStyle,
): ScanStyle {
  if (own === blockStyle) return o.style ?? blockStyle;
  if (!o.style) return own;
  const scale = own.fontSize / blockStyle.fontSize;
  return {
    ...o.style,
    fontSize: o.style.fontSize * scale,
    weight: o.style.weight * scale,
    hollow: o.style.hollow * scale,
    ink: own.ink,
  };
}

function withOverride(o: ScanOverride, base: ScanStyle): ScanStyle {
  const newFamily = o.family !== undefined;
  return {
    family: o.family ?? base.family,
    fontSize: o.fontSize ?? base.fontSize,
    ink: o.fill ?? base.ink,
    stretch: newFamily ? 1 : base.stretch,
    weight: newFamily ? 0 : base.weight,
    hollow: newFamily ? 0 : base.hollow,
    softness: base.softness,
  };
}

// Lazy: fitting renders the scan, and an edit that only deletes words needs no style.
function editStyles(
  doc: EditorDocument,
  page: Page,
  state: ScanEditState,
  o: ScanOverride,
  text: string,
): EditStyles {
  let blockFitted: ScanStyle | null | undefined;
  const blockFit = () =>
    blockFitted === undefined
      ? (blockFitted = styleFor(doc, page, state, null))
      : blockFitted;
  let fittedStyle: ScanStyle | undefined;
  const fitted = () =>
    (fittedStyle ??=
      blockFit() ??
      fallbackStyle(state, inkAgainst(doc.module, page, state), text));
  const inkOf = (w: LayoutWord) =>
    spanInk(doc, page, state, w.line, w.index, w.index);
  const styles = new Map<LayoutWord | null, ScanStyle>();
  const styleOf = (anchor: LayoutWord | null): ScanStyle => {
    const known = styles.get(anchor);
    if (known) return known;
    const blockStyle = fitted();
    const own =
      styleFor(doc, page, state, anchor ? inkOf(anchor) : null) ?? blockStyle;
    const style = withOverride(o, anchorBase(o, own, blockStyle));
    styles.set(anchor, style);
    return style;
  };
  return {
    blockFit,
    fitted,
    fittedSoFar: () => fittedStyle,
    styleOf,
    inkOf,
  };
}

interface ScanGlyphSource {
  atlas: () => GlyphAtlas | null;
  composed: (text: string) => ComposedText | null;
  /** The letters the edit types, read when the atlas is first built. */
  setTyped: (chars: Iterable<string>) => void;
}

function scanGlyphSource(
  doc: EditorDocument,
  page: Page,
  state: ScanEditState,
  enabled: boolean,
  fitBlock: () => unknown,
  space: number,
): ScanGlyphSource {
  let atlasMemo: GlyphAtlas | null | undefined;
  let typed = new Set<string>();
  const atlas = () => {
    if (atlasMemo !== undefined) return atlasMemo;
    if (!enabled) return (atlasMemo = null);
    fitBlock();
    return (atlasMemo = atlasOf(doc, page, state, typed));
  };
  const cache = new Map<string, ComposedText | null>();
  const composed = (t: string) => {
    const a = atlas();
    if (!a) return null;
    if (!cache.has(t)) cache.set(t, composeText(a, t, space * a.scale));
    return cache.get(t) ?? null;
  };
  return {
    atlas,
    composed,
    setTyped: (chars) => {
      typed = new Set(chars);
    },
  };
}

function renderUprightScanEdit(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
  state: ScanEditState,
  text: string,
): boolean {
  const m = doc.module;
  if (state.lines.some(implausibleLine) || offInk(doc, page, state)) {
    const original = state.lines.map((l) => l.text).join(" ");
    recordUndrawableChars(
      [...text].filter((ch) => !original.includes(ch)).join(""),
    );
    return false;
  }

  const shift = state.frame
    ? applyVector(state.frame.toUpright, state.override.dx, state.override.dy)
    : { dx: state.override.dx, dy: state.override.dy };
  const o = { ...state.override, ...shift };
  const restyle =
    o.family !== undefined || o.fontSize !== undefined || o.fill !== undefined;
  const needsFont = restyle || !keepsOnlyScannedWords(state, text);
  const styles = editStyles(doc, page, state, o, text);
  const { blockFit, fitted, styleOf, inkOf } = styles;
  const spacing = o.style ?? (needsFont ? fitted() : fallbackStyle(state));
  const lineBase = (li: number) =>
    lineInk(doc, page, state, li)?.baseline ?? state.lines[li].baseline;
  const scanWord = (w: LayoutWord) => state.lines[w.line].words[w.index];
  const space = wordSpace(state, spacing);
  const glyphSource = scanGlyphSource(
    doc,
    page,
    state,
    !restyle && !o.style,
    blockFit,
    space,
  );
  const { atlas, composed } = glyphSource;
  const canDraw = (t: string) =>
    !UNSHAPED_SCRIPT.test(t) &&
    (!!composed(t) ||
      !!o.style ||
      o.family !== undefined ||
      !!blockFit() ||
      scanFaces().some((f) => faceCovers(f, t)));

  const inkWidth = (w: LayoutWord) =>
    inkOf(w)?.ink.body.width ?? scanWord(w).right - scanWord(w).x;
  const shows = (t: string, anchor: LayoutWord | null) =>
    !!composed(t) || styleCovers(styleOf(anchor), t);
  // Text no face can show keeps the scanned words it replaces, so it spans them.
  const keptWidth = (anchor: LayoutWord, replaced: LayoutWord[]) => {
    const last =
      replaced.filter((w) => w.line === anchor.line).at(-1) ?? anchor;
    return last.x + inkWidth(last) - anchor.x;
  };

  const plan = onOriginalScan(doc, page, state, () => {
    const lines = state.lines.map((l, li) => ({
      baseline: lineBase(li),
      words: l.words.map((w, wi) => ({
        line: li,
        index: wi,
        text: w.text.trim(),
        x: w.x,
        lead: extraSpacesBefore(l, w, wi),
      })),
    }));
    const pitch = linePitch(state, spacing);
    glyphSource.setTyped(
      layoutScanEdit({
        lines,
        text,
        pitch,
        space,
        wordWidth: (w) => scanWord(w).right - w.x,
        textWidth: () => 0,
        redraw: restyle,
      }).typed.flatMap((t) => [...t.text.replace(/\s+/g, "")]),
    );
    const layout = layoutScanEdit({
      lines,
      text,
      pitch,
      space,
      wordWidth: inkWidth,
      textWidth: (t, anchor, replaced) => {
        if (!shows(t, anchor)) return anchor ? keptWidth(anchor, replaced) : 0;
        const glyphs = composed(t);
        const a = atlas();
        if (glyphs && a) return (glyphs.inkRight - glyphs.inkLeft) / a.scale;
        const st = styleOf(anchor);
        return spanOf(doc, page, t, st.family, st.fontSize) * st.stretch;
      },
      redraw: restyle,
    });

    // A whole-block move shifts everything, kept pixels included.
    const shifted = o.dx !== 0 || o.dy !== 0;
    const kept = layout.kept.map((k) => ({
      ...k,
      x: k.x + o.dx,
      baseline: k.baseline + o.dy,
      moved: k.moved || shifted,
    }));
    const moving = kept
      .filter((k) => k.moved)
      .map((k) => {
        const ink = inkOf(k.word);
        const key = `${k.word.line}:${k.word.index}`;
        return {
          ...k,
          ink,
          patch: ink ? patchOf(doc, page, state, key, ink) : null,
        };
      });

    const drawn = [
      ...layout.typed.map((t) => ({ text: t.text, anchor: t.anchor })),
      ...moving
        .filter((k) => !k.patch)
        .map((k) => ({ text: k.word.text, anchor: k.word })),
    ];
    const refused = drawn.filter((d) => !canDraw(d.text));
    if (refused.length > 0) {
      recordUndrawableChars(refused.map((d) => d.text).join(""));
      return null;
    }
    for (const d of drawn) styleOf(d.anchor);
    const unshown = new Set(
      layout.typed.filter((t) => !shows(t.text, t.anchor)),
    );
    if (unshown.size > 0)
      recordUndrawableChars(
        [...unshown].map((t) => t.text.replace(/\s+/g, "")).join(""),
      );
    return { layout, kept, moving, unshown };
  });
  if (!plan) return false;
  const { layout, kept, moving, unshown } = plan;
  const keptScan = new Set([...unshown].flatMap((t) => t.replaced));

  for (const p of state.created) removeAndDestroyObject(m, page.pagePtr, p);
  state.created = [];
  state.textPtrs = [];
  const canvas: Canvas = {
    doc,
    page,
    tagMarks: run.tagMarks,
    created: state.created,
    textPtrs: state.textPtrs,
    searchableFontPtr: state.fontPtr,
  };

  // Cover what was removed or moved away.
  const coverWord = (w: LayoutWord) => {
    const ink = inkOf(w);
    const sw = scanWord(w);
    const line = state.lines[w.line];
    const rect = ink?.ink.rect ?? {
      x: sw.x - 0.5,
      y: sw.baseline - line.height * 0.35,
      width: sw.right - sw.x + 1,
      height: line.height * 1.7,
    };
    const paper = ink?.paper ?? sampleBackground(m, page, rect).fill;
    const ptr = emitFillRect(m, page, rect, paper, 0);
    if (ptr) state.created.push(ptr);
  };
  for (const w of layout.removed) if (!keptScan.has(w)) coverWord(w);
  for (const k of moving) coverWord(k.word);

  const nextWordLimit = (start: number, baseline: number, size: number) => {
    const next = kept
      .filter((k) => Math.abs(k.baseline - baseline) < 1 && k.x > start + 0.5)
      .map((k) => k.x);
    return next.length === 0 ? Infinity : Math.min(...next) - wordGap(size);
  };

  const baselineAt = (li: number, x: number) => {
    const words = state.lines[li].words;
    const centres = words.map((w) => (w.x + w.right) / 2);
    const mean = words.reduce((sum, w) => sum + w.baseline, 0) / words.length;
    const correction = lineBase(li) - mean;
    const after = centres.findIndex((c) => c >= x);
    if (after <= 0)
      return words[after < 0 ? words.length - 1 : 0].baseline + correction;
    const a = words[after - 1];
    const b = words[after];
    const t =
      (x - centres[after - 1]) / (centres[after] - centres[after - 1] || 1);
    return a.baseline + (b.baseline - a.baseline) * t + correction;
  };
  const baselineFor = (
    li: number,
    layoutBaseline: number,
    x: number,
    anchor: LayoutWord | null,
  ) => {
    if (li >= state.lines.length) return layoutBaseline;
    const shift = layoutBaseline - lineBase(li);
    if (anchor && anchor.line === li)
      return (inkOf(anchor)?.baseline ?? scanWord(anchor).baseline) + shift;
    return baselineAt(li, x - o.dx) + shift;
  };

  let fromAtlas = 0;
  let inFont = 0;
  const drawTyped = (
    t: string,
    x: number,
    line: number,
    layoutBaseline: number,
    anchor: LayoutWord | null,
    atAnchor: boolean,
  ) => {
    const baseline = baselineFor(line, layoutBaseline, x, anchor);
    const ink = anchor ? inkOf(anchor) : null;
    let s = t;
    // OCR reads a box edge hugging the text as a bracket; never draw it.
    if (ink?.dropLead) s = s.replace(/^[[|(]/, "");
    if (ink?.dropTrail) s = s.replace(/[\]|)]$/, "");
    if (!s) return;
    const st = styleOf(anchor);
    const start = atAnchor && ink ? ink.ink.body.x + o.dx : x;
    const limit = nextWordLimit(start, layoutBaseline, st.fontSize);
    const glyphs = composed(s);
    const a = atlas();
    if (
      a &&
      glyphs &&
      drawFromAtlas(canvas, a, glyphs, s, start, baseline, st, limit)
    ) {
      fromAtlas++;
      return;
    }
    inFont++;
    drawInFont(canvas, s, x, start, baseline, st, limit);
  };

  // Moved words: the scan's own pixels at their new spot, plus invisible text.
  for (const k of moving) {
    const sw = scanWord(k.word);
    if (!k.patch) {
      drawTyped(k.word.text, k.x, k.line, k.baseline, k.word, false);
      continue;
    }
    const inkOnly = { ...k.patch, rgba: k.patch.rgba.slice() };
    if (k.ink) toInkOnly(inkOnly, k.ink.paper, k.ink.ink.reversed);
    const r = k.patch.rect;
    pasteImage(canvas, inkOnly, {
      ...r,
      x: r.x + k.x - sw.x,
      y: r.y + k.baseline - lineBase(k.word.line),
    });
    emitSearchable(
      canvas,
      sw.text.trimEnd() || sw.text,
      { left: k.x, right: k.x + sw.right - sw.x },
      sw.baseline + k.baseline - lineBase(k.word.line),
      sw.fontSize,
      { originalFontPtr: state.fontPtr, family: "Helvetica" },
    );
  }
  for (const t of layout.typed)
    if (!unshown.has(t))
      drawTyped(
        t.text,
        t.x + o.dx,
        t.line,
        t.baseline + o.dy,
        t.anchor,
        t.atAnchor,
      );

  syncOriginalWords(
    canvas,
    state,
    new Set(
      [
        ...layout.removed.filter((w) => !keptScan.has(w)),
        ...moving.map((k) => k.word),
      ].map((w) => `${w.line}:${w.index}`),
    ),
  );
  attachToRun(run, state);
  state.edited = true;
  state.typedFromScan = fromAtlas > 0 && inFont === 0;
  // Show what is drawn, not OCR's guesses, so the size and colour controls start from it.
  const shown = o.style ?? styles.fittedSoFar();
  run.fontSize = o.fontSize ?? shown?.fontSize ?? run.fontSize;
  run.fill = o.fill ?? shown?.ink ?? run.fill;
  run.text = text;
  run.dirty = true;
  page.markDirty();
  page.markNeedsGenerate();
  return true;
}

// Original OCR words leave the page when removed or moved, and return when an undo puts them back.
function syncOriginalWords(
  canvas: Canvas,
  state: ScanEditState,
  gone: Set<string>,
): void {
  const { doc, page } = canvas;
  state.lines.forEach((line, li) =>
    line.words.forEach((word, wi) => {
      const key = `${li}:${wi}`;
      if (gone.has(key) && !state.lifted.has(key)) {
        removeMemberPtrs(
          doc.module,
          page,
          [word.ptr, ...(word.extraPtrs ?? [])],
          new Map([[word.ptr, word.container]]),
          0,
        );
        state.lifted.add(key);
      } else if (!gone.has(key) && state.lifted.has(key)) {
        const back = invisibleText(
          canvas,
          word.text.trimEnd() || word.text,
          { left: word.x, right: word.right },
          word.baseline,
          word.fontSize,
          { originalFontPtr: state.fontPtr, family: "Helvetica" },
        );
        word.ptr = back[0] ?? 0;
        word.extraPtrs = back.slice(1);
        word.container = 0;
        state.lifted.delete(key);
      }
    }),
  );
}

// Deleting the run takes its drawn text and OCR words; the covers stay, as the scan under them is the old text.
function attachToRun(run: TextRun, state: ScanEditState): void {
  const live = state.lines.flatMap((l, li) =>
    l.words.filter((_, wi) => !state.lifted.has(`${li}:${wi}`)),
  );
  run.paragraphLeafPtrs = [
    ...live.flatMap((w) => [w.ptr, ...(w.extraPtrs ?? [])]),
    ...state.textPtrs,
  ];
  run.paragraphLeafContainers = [
    ...live.flatMap((w) => [w.container, ...(w.extraPtrs ?? []).map(() => 0)]),
    ...state.textPtrs.map(() => 0),
  ];
}

/** The run's scan-edit state, captured on first use; null when it has none. */
export function scanEditOf(
  doc: EditorDocument,
  run: TextRun,
): ScanEditState | null {
  if (!isScanRun(run)) return run.scanEdit;
  run.scanEdit ??= captureScanEdit(doc.module, run, doc.page(run.pageIndex));
  return run.scanEdit;
}

/** The run's text reflowed to `maxWidthPt` in its drawn style, or null for non-scanned text; a line is added below only where the page is clear. */
export function wrapScanText(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
  maxWidthPt: number,
): string | null {
  const state = scanEditOf(doc, run);
  if (!state || state.lines.length === 0) return null;
  const style = withOverride(
    state.override,
    state.override.style ?? drawnBlockStyle(doc, state) ?? fallbackStyle(state),
  );
  const width = (line: string) =>
    spanOf(doc, page, line, style.family, style.fontSize) * style.stretch;
  const fits = (line: string) => line === "" || width(line) <= maxWidthPt;
  const grown = rewrapLines(run.text, fits, true);
  const wrapped = roomBelow(
    page,
    run,
    state,
    linePitch(state, style),
    grown.split("\n").length,
  )
    ? grown
    : rewrapLines(run.text, fits, false);
  // All or nothing: without room for the last line's overflow the text would just stick out on another line.
  const settled = wrapped
    .split("\n")
    .every((line) => fits(line.trim()) || !line.trim().includes(" "));
  return settled ? wrapped : run.text;
}

function roomBelow(
  page: Page,
  run: TextRun,
  state: ScanEditState,
  pitch: number,
  lineCount: number,
): boolean {
  const added = lineCount - state.lines.length;
  if (added <= 0) return true;
  // Lines of a turned block are not in the page space other runs are in.
  if (state.frame) return false;
  const last = state.lines[state.lines.length - 1];
  const bottom = last.baseline - added * pitch - last.height * 0.35;
  const top = last.baseline - last.height * 0.35;
  const left = Math.min(...state.lines.map((l) => l.words[0]?.x ?? Infinity));
  const right = Math.max(
    ...state.lines.map((l) => l.words[l.words.length - 1]?.right ?? -Infinity),
  );
  return !page.runs.some((other) => {
    if (other === run) return false;
    const b = other.bounds;
    return (
      b.x < right &&
      b.x + b.width > left &&
      b.y < top &&
      b.y + b.height > bottom
    );
  });
}

function upright<T>(
  doc: EditorDocument,
  page: Page,
  state: ScanEditState,
  fn: () => T,
): T {
  const frame = state.frame;
  if (!frame || state.upright) return fn();
  moveAllObjects(doc.module, page, frame.toUpright);
  state.upright = true;
  try {
    return fn();
  } finally {
    state.upright = false;
    moveAllObjects(doc.module, page, frame.fromUpright);
  }
}

/** The size the block is drawn at, fitting its style first if need be. */
export function scanDrawnSize(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
): number | null {
  const state = scanEditOf(doc, run);
  if (!state) return null;
  return (
    state.override.fontSize ??
    state.override.style?.fontSize ??
    (
      upright(doc, page, state, () => styleFor(doc, page, state, null)) ??
      fallbackStyle(state)
    ).fontSize
  );
}

/**
 * Apply a whole-block move or restyle and redraw. Returns the override it
 * replaced, for undo, or null when the run is not editable scanned text.
 */
export function setScanOverride(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
  next: (prev: ScanOverride) => ScanOverride,
): ScanOverride | null {
  const state = scanEditOf(doc, run);
  if (!state) return null;
  const prev = state.override;
  state.override = next(prev);
  renderScanEdit(doc, page, run, state, run.text);
  return prev;
}

function onOriginalScan<T>(
  doc: EditorDocument,
  page: Page,
  state: ScanEditState,
  fn: () => T,
): T {
  if (state.offScan) return fn();
  const m = doc.module;
  const created = [...state.created];
  for (const p of created) m.FPDFPage_RemoveObject(page.pagePtr, p);
  state.offScan = true;
  try {
    return fn();
  } finally {
    state.offScan = false;
    for (const p of created) m.FPDFPage_InsertObject(page.pagePtr, p);
  }
}

export function scanTypingDropped(run: TextRun): boolean {
  if (!isScanRun(run)) return false;
  const o = run.scanEdit?.override;
  if (o?.style || o?.family !== undefined) return false;
  return (
    UNSHAPED_SCRIPT.test(run.text) ||
    !scanFaces().some((f) => faceCovers(f, run.text))
  );
}

export function scanBlockMisaligned(
  doc: EditorDocument,
  run: TextRun,
): boolean {
  return scanEditOf(doc, run)?.lines.some(implausibleLine) ?? false;
}

export function scanBlockOffInk(doc: EditorDocument, run: TextRun): boolean {
  const state = scanEditOf(doc, run);
  if (!state) return false;
  const page = doc.page(run.pageIndex);
  return upright(doc, page, state, () => offInk(doc, page, state));
}

export function scanBlockUndrawable(
  doc: EditorDocument,
  run: TextRun,
): boolean {
  return scanEditOf(doc, run)?.block === null;
}

export function rerankScanStyles(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
): RankedStyle[] {
  const state = scanEditOf(doc, run);
  if (!state) return [];
  return upright(doc, page, state, () =>
    onOriginalScan(doc, page, state, () => rerank(doc, page, state)),
  );
}

const rankedOf = (state: ScanEditState) => state.block?.ranked ?? [];

/** Ranks the available faces against text the page draws, as a scanned block is ranked; `state` from {@link captureScanEdit} stays off the run, and after FIT_PAUSED the same `state` carries on. */
export function rankFacesForDrawnText(
  doc: EditorDocument,
  page: Page,
  state: ScanEditState,
): RankedStyle[] {
  return upright(doc, page, state, () => {
    if (state.block === undefined) styleFor(doc, page, state, null);
    return rankedOf(state);
  });
}

function rerank(
  doc: EditorDocument,
  page: Page,
  state: ScanEditState,
): RankedStyle[] {
  const before = state.block;
  if (!before) {
    state.block = undefined;
    styleFor(doc, page, state, null);
    return rankedOf(state);
  }
  const spans = inkedLines(doc, page, state).map((l) => l.ink);
  const ranked = rank(doc, page, state, spans, before.ref);
  if (ranked.length === 0) return before.ranked;
  state.block = {
    ...before,
    ranked,
    style: state.created.length > 0 ? before.style : ranked[0].style,
  };
  return ranked;
}

export function previewScanStyle(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
  style: ScanStyle,
): { scan: PixelPatch; drawn: PixelPatch } | null {
  const state = scanEditOf(doc, run);
  const ref = state?.block?.ref;
  if (!state || !ref) return null;
  return upright(doc, page, state, () =>
    onOriginalScan(doc, page, state, () =>
      previewOnScan(doc, page, ref, style),
    ),
  );
}

function previewOnScan(
  doc: EditorDocument,
  page: Page,
  ref: SpanInk,
  style: ScanStyle,
): { scan: PixelPatch; drawn: PixelPatch } | null {
  const m = doc.module;
  const rect = ref.ink.rect;
  const scan = capturePatch(m, page, rect);
  if (!scan) return null;
  const sheet = doc.scratchPageFor(page);
  const cover = emitFillRect(m, sheet.page, rect, ref.paper);
  const ptrs = placeText(sheet.doc, sheet.page, {
    text: ref.original,
    x: ref.ink.body.x,
    baseline: ref.baseline,
    family: style.family,
    size: style.fontSize,
    stretch: style.stretch,
    inkLeft: ref.ink.body.x,
    fill: style.ink,
    weight: style.weight,
    hollow: style.hollow,
  });
  const drawn = capturePatch(m, sheet.page, rect);
  for (const p of [cover, ...ptrs])
    removeAndDestroyObject(m, sheet.page.pagePtr, p);
  if (!drawn) return null;
  if (style.softness > 0) blurRgba(drawn, style.softness);
  return { scan, drawn };
}

/** The font a scanned block's changed words are drawn in. */
export interface ScanDrawnFont {
  /** The family as the font picker names it. */
  family: string;
  /** How the scan matcher names the face, e.g. "Calibri (Carlito)". */
  label: string;
}

/** The font in force for a scanned run (picked, else matched), never the OCR layer's `fontId`; null while unfitted or typed from scan letters. Cheap: captures no scan state. */
export function scanDrawnFont(
  doc: EditorDocument,
  run: TextRun,
): ScanDrawnFont | null {
  const state = run.scanEdit;
  if (!state || state.typedFromScan) return null;
  const family =
    state.override.family ??
    (state.override.style ?? drawnBlockStyle(doc, state))?.family;
  if (!family) return null;
  const face = scanFaces().find(
    (f) => f.family === family || f.bold === family,
  );
  return { family, label: face?.label ?? family };
}
