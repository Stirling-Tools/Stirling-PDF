import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@app/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@app/tools/pdfTextEditor/model/TextRun";
import type { PageRect, RGBA } from "@app/tools/pdfTextEditor/types";
import {
  INK_SCALE,
  capturePatch,
  measureScanInk,
  sampleBackground,
  type PixelPatch,
  type ScanInk,
} from "@app/tools/pdfTextEditor/pdfium/BackgroundSampler";
import {
  layoutScanEdit,
  type LayoutWord,
} from "@app/tools/pdfTextEditor/commands/scanLayout";
import { createBitmapImageObject } from "@app/utils/pdfiumBitmapUtils";
import {
  emitFillRect,
  emitTextLine,
  measureObjSpanPt,
  removeAndDestroyObject,
  removeMemberPtrs,
} from "@app/tools/pdfTextEditor/commands/editTextHelpers";
import {
  COURIER,
  FACES,
  HELVETICA,
  clampStretch,
  fitFace,
  isEvenlySpaced,
  matchScan,
  median,
  placeText,
  blurRgba,
  softnessOf,
  toInkOnly,
  opaqueStroke,
  spanOf,
  topShare,
  type Face,
} from "@app/tools/pdfTextEditor/commands/scanStyle";

// Editing OCR text on a scanned page. The words live twice: as pixels in the
// scan and as invisible (Tr 3) text. An edit draws only the words the user
// typed; every other word stays the scan's own pixels (moved if it has to make
// room), so OCR misreads never reach the page.

const INVISIBLE = 3;
const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 255 };

interface ScanWord {
  text: string;
  /** Char offset of the word within its line. */
  start: number;
  x: number;
  right: number;
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

// How scanned text is redrawn: one face, size and colour for a whole block.
interface ScanStyle {
  family: string;
  fontSize: number;
  /** Horizontal scale that gives the face the scan's letter widths. */
  stretch: number;
  ink: RGBA;
  /** Outline that thickens the strokes to the scan's weight, in points. */
  weight: number;
  /** Blur, in render pixels, that softens drawn text to the scan's focus. */
  softness: number;
}

/** A move or restyle the user applied to the whole block. */
export interface ScanOverride {
  dx: number;
  dy: number;
  family?: string;
  fontSize?: number;
  fill?: RGBA;
}

interface SpanInk {
  ink: ScanInk;
  /** Paper colour right around the span. */
  paper: RGBA;
  baseline: number;
  /** The OCR text of the span, minus any box edge it read as a bracket. */
  original: string;
  dropLead: boolean;
  dropTrail: boolean;
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
  block?: { style: ScanStyle; top: number } | null;
  /** Styles for text in the block that the scan sets at another size. */
  classes: Array<{ style: ScanStyle; top: number }>;
  face?: Face | null;
  nearbyFace?: Face | null;
  neighbours?: PlacedWord[];
}

interface PlacedWord {
  x: number;
  right: number;
  baseline: number;
}

export function isScanRun(run: TextRun): boolean {
  return run.renderMode === INVISIBLE;
}

// Snapshot a run's OCR words. Null when the run carries no per-word geometry,
// which leaves the caller on the whole-run rewrite.
export function captureScanEdit(
  m: WrappedPdfiumModule,
  run: TextRun,
): ScanEditState | null {
  const texts = run.text.split("\n");
  const slots =
    run.paragraphLineSlots.length === texts.length
      ? run.paragraphLineSlots
      : texts.length === 1
        ? [
            {
              baselineY: run.matrix.f,
              containerPtr: run.containerPtr,
              fontSize: run.fontSize,
              mergedFromPtrs: run.mergedFromPtrs.length
                ? run.mergedFromPtrs
                : [run.pdfiumObjPtr],
              mergedFromTexts: run.mergedFromTexts.length
                ? run.mergedFromTexts
                : [run.text],
              mergedFromBounds: run.mergedFromBounds.length
                ? run.mergedFromBounds
                : [{ x: run.bounds.x, right: run.bounds.x + run.bounds.width }],
              mergedFromCharStarts: run.mergedFromCharStarts.length
                ? run.mergedFromCharStarts
                : [0],
            },
          ]
        : null;
  if (!slots) return null;
  const top = run.bounds.y + run.bounds.height;
  const height = Math.max(2, top - slots[0].baselineY);
  const lines: ScanLine[] = [];
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    const n = s.mergedFromPtrs.length;
    if (
      n === 0 ||
      s.mergedFromTexts.length !== n ||
      s.mergedFromBounds.length !== n ||
      s.mergedFromCharStarts.length !== n ||
      s.mergedFromPtrs.some((p) => !p)
    )
      return null;
    lines.push({
      text: texts[i],
      baseline: s.baselineY,
      height,
      words: s.mergedFromPtrs.map((ptr, w) => ({
        text: s.mergedFromTexts[w],
        start: s.mergedFromCharStarts[w],
        x: s.mergedFromBounds[w].x,
        right: s.mergedFromBounds[w].right,
        ptr,
        container: s.containerPtr || run.containerPtr,
        fontSize: s.fontSize,
      })),
    });
  }
  let fontPtr = 0;
  try {
    fontPtr = m.FPDFTextObj_GetFont(lines[0].words[0].ptr);
  } catch {
    fontPtr = 0;
  }
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

/** Where word `w` of a line ends in the line's text, its trailing space included. */
function wordEnd(line: ScanLine, w: number): number {
  return w + 1 < line.words.length ? line.words[w + 1].start : line.text.length;
}

const wordsOf = (lines: ScanLine[]) =>
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
  const own = state.lines[0];
  const pooled: Array<{ text: string; width: number }> = [];
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
    const texts = run.mergedFromTexts.length ? run.mergedFromTexts : [run.text];
    const bounds = run.mergedFromBounds.length
      ? run.mergedFromBounds
      : [{ x: run.bounds.x, right: run.bounds.x + run.bounds.width }];
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
    const slots = run.paragraphLineSlots.length
      ? run.paragraphLineSlots
      : [{ baselineY: run.matrix.f, mergedFromBounds: run.mergedFromBounds }];
    for (const s of slots)
      for (const b of s.mergedFromBounds)
        out.push({ x: b.x, right: b.right, baseline: s.baselineY });
    if (!run.mergedFromBounds.length && !run.paragraphLineSlots.length)
      out.push({
        x: run.bounds.x,
        right: run.bounds.x + run.bounds.width,
        baseline: run.matrix.f,
      });
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
  const m = doc.module;
  const line = state.lines[li];
  const words = line.words;
  const prev = words[from - 1];
  const next = words[to + 1];
  // Stay clear of the neighbouring words' ink, however close they sit.
  let x0 = prev ? (prev.right + words[from].x) / 2 : words[from].x - 2;
  let x1 = next ? (words[to].right + next.x) / 2 : words[to].right + 2;
  // OCR word boxes can overrun into words the OCR put in another block.
  for (const w of otherWords(page, state)) {
    if (Math.abs(w.baseline - line.baseline) > line.height * 0.5) continue;
    if (w.x > words[to].x + 0.5) x1 = Math.min(x1, w.x - 0.3);
    if (w.right < words[from].x + 0.5) x0 = Math.max(x0, w.right + 0.3);
  }
  const region = {
    x0,
    x1,
    bottom: line.baseline - line.height * 0.1,
    top: line.baseline + line.height * 0.9,
  };
  const ink = measureScanInk(m, page, region);
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
        Math.abs(ink.baseline - line.baseline) < line.height * 0.4
          ? ink.baseline
          : line.baseline,
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

/** How far the glyphs of a span rise above its baseline. */
const inkTop = (s: SpanInk) => s.ink.body.y + s.ink.body.height - s.baseline;

// Readers judge size by the lowercase, so mostly-lowercase text is sized by
// its x-height; ascenders, overshoot and blur all read taller than the face.
// OCR's letter case is unreliable, so the scan's own rows decide.
function sizeFor(face: Face, s: SpanInk): number {
  if (s.ink.xLine !== null)
    return (s.ink.xLine - s.baseline) / (face.xh / 1000);
  return inkTop(s) / topShare(face, s.original);
}

// Render pixels per scanned pixel under `rect`. A low-res scan scaled up is
// soft however sharp its pixel steps look, so this sets a floor on softness.
function scanPixelSpan(
  doc: EditorDocument,
  page: Page,
  rect: PageRect,
): number {
  const m = doc.module;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const under = page.images
    .filter(
      (img) =>
        cx >= img.bounds.x &&
        cx <= img.bounds.x + img.bounds.width &&
        cy >= img.bounds.y &&
        cy <= img.bounds.y + img.bounds.height,
    )
    .sort(
      (p, q) =>
        q.bounds.width * q.bounds.height - p.bounds.width * p.bounds.height,
    )[0];
  if (!under) return 0;
  const wPtr = m.pdfium.wasmExports.malloc(4);
  const hPtr = m.pdfium.wasmExports.malloc(4);
  try {
    if (!m.FPDFImageObj_GetImagePixelSize(under.pdfiumObjPtr, wPtr, hPtr))
      return 0;
    const pixels = m.pdfium.getValue(wPtr, "i32");
    return pixels > 0 ? (INK_SCALE * under.bounds.width) / pixels : 0;
  } catch {
    return 0;
  } finally {
    m.pdfium.wasmExports.free(wPtr);
    m.pdfium.wasmExports.free(hPtr);
  }
}

// The face, weight, size and letter width that redraw `ref` most like the
// scan; the size is shared by every span in `spans`.
function fitStyle(
  doc: EditorDocument,
  page: Page,
  state: ScanEditState,
  spans: SpanInk[],
  ref: SpanInk,
): ScanStyle | null {
  const fit = (face: Face, family: string) => {
    const size = sizeFor(face, ref);
    const natural = spanOf(doc, page, ref.original, family, size);
    const stretch = clampStretch(ref.ink.body.width / Math.max(1e-3, natural));
    return { face, family, size, stretch };
  };
  // Typewriter evidence is sturdier than pixels on a blurry low-res scan, so
  // it settles the face; the pixels still pick the weight.
  const typewriter =
    faceFor(doc, page, state) === COURIER ||
    isEvenlySpaced(ref.ink.glyphCenters, ref.original);
  const candidates = (typewriter ? [COURIER] : FACES)
    .flatMap((face) => [fit(face, face.family), fit(face, face.bold)])
    .filter((c) => c.size > 2)
    .map((c) => ({
      ...c,
      score: matchScan(doc, page, ref.ink, {
        text: ref.original,
        x: ref.ink.body.x,
        baseline: ref.baseline,
        family: c.family,
        size: c.size,
        stretch: c.stretch,
      }).score,
    }));
  if (candidates.length === 0) return null;
  const best = (cs: typeof candidates) =>
    cs.reduce((p, q) => (q.score > p.score ? q : p));
  let chosen = best(candidates);
  // A typewritten block nearby tips a close call its way.
  const mono = candidates.filter((c) => c.face === COURIER);
  if (
    !typewriter &&
    nearbyFace(doc, page, state) === COURIER &&
    best(mono).score > chosen.score - 0.1
  )
    chosen = best(mono);
  // Glyph height alone reads large: blur, round letters overshooting the cap
  // line and digits taller than capitals all add to it. Let the pixels settle
  // the size within a few percent.
  const tries = [0.88, 0.91, 0.94, 0.97, 1, 1.03].map((k) => {
    const size = chosen.size * k;
    const natural = spanOf(doc, page, ref.original, chosen.family, size);
    const stretch = clampStretch(ref.ink.body.width / Math.max(1e-3, natural));
    const { score } = matchScan(doc, page, ref.ink, {
      text: ref.original,
      x: ref.ink.body.x,
      baseline: ref.baseline,
      family: chosen.family,
      size,
      stretch,
    });
    return { k, size, stretch, score };
  });
  const tuned = tries.reduce((p, q) => (q.score > p.score ? q : p));
  chosen = { ...chosen, size: tuned.size, stretch: tuned.stretch };
  // A blurry scan makes crisp new text stand out; match its softness too,
  // and never go crisper than the scan's own pixels allow.
  const floor = Math.round(scanPixelSpan(doc, page, ref.ink.rect) / 2);
  const measured = softnessOf(doc, page, ref.ink, {
    text: ref.original,
    x: ref.ink.body.x,
    baseline: ref.baseline,
    family: chosen.family,
    size: chosen.size,
    stretch: chosen.stretch,
  });
  const softness = Math.min(2, Math.max(measured, floor));
  // Blur thickens scanned strokes past any bold; add outline until the drawn
  // strokes, softened the same way, are as thick as the scanned ones.
  // Only past bold: on regular text blur alone would read as extra weight.
  const weight = (chosen.family === chosen.face.bold ? [0, 0.025, 0.05] : [0])
    .map((k) => k * chosen.size)
    .map((w) => ({
      w,
      ratio: matchScan(
        doc,
        page,
        ref.ink,
        {
          text: ref.original,
          x: ref.ink.body.x,
          baseline: ref.baseline,
          family: chosen.family,
          size: chosen.size,
          stretch: chosen.stretch,
          weight: w,
        },
        softness,
      ).weight,
    }))
    .reduce((p, q) =>
      Math.abs(Math.log(q.ratio)) < Math.abs(Math.log(p.ratio)) ? q : p,
    ).w;
  // One size for every line; the median shrugs off a line of lowercase.
  const sizes = spans.map((s) => sizeFor(chosen.face, s)).filter((v) => v > 2);
  return {
    family: chosen.family,
    fontSize: sizes.length ? median(sizes) * tuned.k : chosen.size,
    stretch: chosen.stretch,
    // Softened text is blurred again, so it starts from the scan's darkest ink.
    ink: softness > 0 ? ref.ink.core : ref.ink.fill,
    weight,
    softness,
  };
}

// One style for the whole block, fitted to its longest line, so an edit never
// switches face or size part way through a sentence. Only text the scan itself
// sets at another size (a label and its value on one OCR line) gets its own.
function styleFor(
  doc: EditorDocument,
  page: Page,
  state: ScanEditState,
  span: SpanInk | null,
): ScanStyle | null {
  if (state.block === undefined) {
    const lines = state.lines
      .map((_, li) => lineInk(doc, page, state, li))
      .filter((s): s is SpanInk => s !== null && s.original.length > 0);
    const ref = lines.length
      ? lines.reduce((p, q) => (q.original.length > p.original.length ? q : p))
      : null;
    const style = ref ? fitStyle(doc, page, state, lines, ref) : null;
    state.block = style ? { style, top: median(lines.map(inkTop)) } : null;
  }
  if (!state.block || !span) return state.block?.style ?? null;
  const top = inkTop(span);
  const near = (t: number) => Math.abs(top / t - 1) < 0.25;
  if (near(state.block.top)) return state.block.style;
  const known = state.classes.find((c) => near(c.top));
  if (known) return known.style;
  const style = fitStyle(doc, page, state, [span], span);
  if (!style) return state.block.style;
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

function lift(m: WrappedPdfiumModule, page: Page, word: ScanWord): void {
  removeMemberPtrs(
    m,
    page,
    [word.ptr, ...(word.extraPtrs ?? [])],
    new Map([[word.ptr, word.container]]),
    0,
  );
}

// Invisible OCR text for a word, so search and copy still find it.
function emitInvisible(
  doc: EditorDocument,
  page: Page,
  state: ScanEditState,
  word: ScanWord,
  x: number,
  baseline: number,
): number[] {
  const ptrs = emitTextLine({
    doc,
    page,
    text: word.text.trimEnd() || word.text,
    x,
    y: baseline,
    fontSize: word.fontSize,
    fill: BLACK,
    originalFontPtr: state.fontPtr,
    fallbackFamily: "Helvetica",
    renderMode: INVISIBLE,
  });
  opaqueStroke(doc.module, ptrs);
  return ptrs;
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

function fallbackStyle(state: ScanEditState): ScanStyle {
  return {
    family: HELVETICA.family,
    fontSize: state.lines[0].height / (HELVETICA.cap / 1000),
    stretch: 1,
    ink: BLACK,
    weight: 0,
    softness: 0,
  };
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

// Make the page show `text` for this run. Words the user kept stay the scan's
// own pixels, moved as a copy when something before them changed width or
// wrapped; typed words are drawn in the block's style; removed ones covered.
export function renderScanEdit(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
  state: ScanEditState,
  text: string,
): void {
  const m = doc.module;
  for (const p of state.created) removeAndDestroyObject(m, page.pagePtr, p);
  state.created = [];
  state.textPtrs = [];

  const o = state.override;
  const restyle =
    o.family !== undefined || o.fontSize !== undefined || o.fill !== undefined;
  const block = styleFor(doc, page, state, null) ?? fallbackStyle(state);
  const inkOf = (w: LayoutWord) =>
    spanInk(doc, page, state, w.line, w.index, w.index);
  const styleOf = (anchor: LayoutWord | null): ScanStyle => {
    const base =
      styleFor(doc, page, state, anchor ? inkOf(anchor) : null) ?? block;
    return {
      family: o.family ?? base.family,
      fontSize: o.fontSize ?? base.fontSize,
      ink: o.fill ?? base.ink,
      stretch: o.family !== undefined ? 1 : base.stretch,
      weight: o.family !== undefined ? 0 : base.weight,
      softness: base.softness,
    };
  };
  const lineBase = (li: number) =>
    lineInk(doc, page, state, li)?.baseline ?? state.lines[li].baseline;
  const scanWord = (w: LayoutWord) => state.lines[w.line].words[w.index];

  const layout = layoutScanEdit({
    lines: state.lines.map((l, li) => ({
      baseline: lineBase(li),
      words: l.words.map((w, wi) => ({
        line: li,
        index: wi,
        text: w.text.trim(),
        x: w.x,
      })),
    })),
    text,
    pitch: linePitch(state, block),
    space: wordSpace(state, block),
    wordWidth: (w) =>
      inkOf(w)?.ink.body.width ?? scanWord(w).right - scanWord(w).x,
    textWidth: (t, anchor) => {
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
  const typed = layout.typed.map((t) => ({
    ...t,
    x: t.x + o.dx,
    baseline: t.baseline + o.dy,
  }));

  // Copy every moving word's pixels before anything is drawn over them.
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

  // Cover what was removed or moved away.
  const coverWord = (w: LayoutWord) => {
    const ink = inkOf(w);
    const sw = scanWord(w);
    const line = state.lines[w.line];
    const rect = ink?.ink.rect ?? {
      x: sw.x - 0.5,
      y: line.baseline - line.height * 0.35,
      width: sw.right - sw.x + 1,
      height: line.height * 1.7,
    };
    const paper = ink?.paper ?? sampleBackground(m, page, rect).fill;
    const ptr = emitFillRect(m, page, rect, paper, 0);
    if (ptr) state.created.push(ptr);
  };
  for (const w of layout.removed) coverWord(w);
  for (const k of moving) coverWord(k.word);

  const drawText = (
    t: string,
    x: number,
    baseline: number,
    anchor: LayoutWord | null,
    atAnchor: boolean,
  ) => {
    const ink = anchor ? inkOf(anchor) : null;
    let s = t;
    // OCR reads a box edge hugging the text as a bracket; never draw it.
    if (ink?.dropLead) s = s.replace(/^[[|(]/, "");
    if (ink?.dropTrail) s = s.replace(/[\]|)]$/, "");
    if (!s) return;
    const st = styleOf(anchor);
    const ptrs = placeText(doc, page, {
      text: s,
      x,
      baseline,
      family: st.family,
      size: st.fontSize,
      stretch: st.stretch,
      inkLeft: atAnchor && ink ? ink.ink.body.x + o.dx : x,
      fill: st.ink,
      weight: st.weight,
    });
    const soft =
      st.softness > 0
        ? softened(ptrs, st, baseline, ink?.ink.rect, ink?.paper)
        : null;
    if (soft) {
      for (const p of ptrs) removeAndDestroyObject(m, page.pagePtr, p);
      // Searchable still: the visible copy is now a picture.
      const hidden = emitTextLine({
        doc,
        page,
        text: s,
        x,
        y: baseline,
        fontSize: st.fontSize,
        fill: BLACK,
        originalFontPtr: 0,
        fallbackFamily: st.family,
        renderMode: INVISIBLE,
      });
      opaqueStroke(m, hidden);
      state.created.push(soft, ...hidden);
      state.textPtrs.push(...hidden);
      return;
    }
    state.created.push(...ptrs);
    state.textPtrs.push(...ptrs);
  };

  // Crisp vector text on a blurry scan stands out, so blurry blocks get their
  // typed words as a picture softened to match.
  const softened = (
    ptrs: number[],
    st: ScanStyle,
    baseline: number,
    /** The scanned word replaced: the copy stays within its height. */
    within?: PageRect,
    /** The paper under the text, which the copy leaves transparent. */
    paper?: RGBA,
  ): number => {
    const span = measureObjSpanPt(m, ptrs);
    if (!span) return 0;
    // Just the glyphs and the blur's reach: a taller copy would also blur a
    // rule or the next line's ink sitting close above or below.
    const margin = st.softness / 4 + 0.25;
    const rect = {
      x: span.left - margin,
      y: baseline - st.fontSize * 0.25 - margin,
      width: span.right - span.left + margin * 2,
      height: st.fontSize * 1.03 + margin * 2,
    };
    if (within) {
      const top = Math.min(rect.y + rect.height, within.y + within.height);
      const bottom = Math.max(rect.y, within.y);
      if (top > bottom)
        Object.assign(rect, { y: bottom, height: top - bottom });
    }
    const patch = capturePatch(m, page, rect);
    if (!patch) return 0;
    blurRgba(patch, st.softness);
    toInkOnly(patch, paper ?? sampleBackground(m, page, rect).fill);
    const img = createBitmapImageObject(
      m,
      doc.docPtr,
      page.pagePtr,
      patch,
      patch.rect.x,
      patch.rect.y,
      patch.rect.width,
      patch.rect.height,
    );
    if (!img) return 0;
    m.FPDFPage_InsertObject(page.pagePtr, img);
    return img;
  };

  // Moved words: the scan's own pixels at their new spot, plus invisible text.
  for (const k of moving) {
    const sw = scanWord(k.word);
    const dx = k.x - sw.x;
    const dy = k.baseline - lineBase(k.word.line);
    if (!k.patch) {
      drawText(k.word.text, k.x, k.baseline, k.word, false);
      continue;
    }
    const r = k.patch.rect;
    const inkOnly = { ...k.patch, rgba: k.patch.rgba.slice() };
    if (k.ink) toInkOnly(inkOnly, k.ink.paper);
    const img = createBitmapImageObject(
      m,
      doc.docPtr,
      page.pagePtr,
      inkOnly,
      r.x + dx,
      r.y + dy,
      r.width,
      r.height,
    );
    if (img) {
      m.FPDFPage_InsertObject(page.pagePtr, img);
      state.created.push(img);
    }
    const hidden = emitInvisible(doc, page, state, sw, k.x, k.baseline);
    state.created.push(...hidden);
    state.textPtrs.push(...hidden);
  }
  for (const t of typed)
    drawText(t.text, t.x, t.baseline, t.anchor, t.atAnchor);

  // Original OCR words leave the page when removed or moved, and come back
  // when an undo puts them where they were.
  const gone = new Set(
    [...layout.removed, ...moving.map((k) => k.word)].map(
      (w) => `${w.line}:${w.index}`,
    ),
  );
  state.lines.forEach((line, li) =>
    line.words.forEach((word, wi) => {
      const key = `${li}:${wi}`;
      if (gone.has(key) && !state.lifted.has(key)) {
        lift(m, page, word);
        state.lifted.add(key);
      } else if (!gone.has(key) && state.lifted.has(key)) {
        const back = emitInvisible(
          doc,
          page,
          state,
          word,
          word.x,
          line.baseline,
        );
        word.ptr = back[0] ?? 0;
        word.extraPtrs = back.slice(1);
        word.container = 0;
        state.lifted.delete(key);
      }
    }),
  );

  // Deleting the run takes the drawn text and the remaining OCR words with it;
  // the covers stay, since the scan under them is the old text.
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
  // Show what is drawn, not OCR's guesses, so size and colour controls start
  // from the right values.
  run.fontSize = o.fontSize ?? block.fontSize;
  run.fill = o.fill ?? block.ink;
  run.text = text;
  run.dirty = true;
  page.markDirty();
  page.markNeedsGenerate();
}

/** The run's scan-edit state, captured on first use; null when it has none. */
export function scanEditOf(
  doc: EditorDocument,
  run: TextRun,
): ScanEditState | null {
  if (!isScanRun(run)) return run.scanEdit;
  run.scanEdit ??= captureScanEdit(doc.module, run);
  return run.scanEdit;
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
    (styleFor(doc, page, state, null) ?? fallbackStyle(state)).fontSize
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
