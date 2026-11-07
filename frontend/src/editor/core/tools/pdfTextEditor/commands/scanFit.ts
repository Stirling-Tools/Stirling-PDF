import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { PageRect, RGBA } from "@editor/tools/pdfTextEditor/types";
import {
  INK_SCALE,
  renderLuma,
  type ScanInk,
} from "@editor/tools/pdfTextEditor/pdfium/BackgroundSampler";
import {
  clampStretch,
  isEvenlySpaced,
  matchScan,
  median,
  softnessOf,
  spanOf,
  textAdvance,
  topShare,
  withScanCache,
  type ScanMatch,
} from "@editor/tools/pdfTextEditor/commands/scanStyle";
import {
  faceCovers,
  scanFaces,
  type Face,
} from "@editor/tools/pdfTextEditor/util/scanFontLibrary";

// How scanned text is redrawn: one face, size and colour for a whole block.
export interface ScanStyle {
  family: string;
  fontSize: number;
  /** Horizontal scale that gives the face the scan's letter widths. */
  stretch: number;
  ink: RGBA;
  /** Outline that thickens the strokes to the scan's weight, in points. */
  weight: number;
  hollow: number;
  /** Blur, in render pixels, that softens drawn text to the scan's focus. */
  softness: number;
}

export interface RankedStyle {
  face: Face;
  style: ScanStyle;
  score: number;
}

export interface SpanInk {
  ink: ScanInk;
  /** Paper colour right around the span. */
  paper: RGBA;
  baseline: number;
  /** The OCR text of the span, minus any box edge it read as a bracket. */
  original: string;
  dropLead: boolean;
  dropTrail: boolean;
}

export interface FitWord {
  text: string;
  width: number;
}

export interface FitInput {
  spans: SpanInk[];
  ref: SpanInk;
  words: FitWord[];
  wordsLookMono: () => boolean;
  neighboursLookMono: () => boolean;
}

const SIZE_STEPS = [0.88, 0.91, 0.94, 0.97, 1, 1.03];
const BY_WIDTH = 3;
const BY_RENDER = 2;
const CROWDED = 12;
const BY_WIDTH_CROWDED = 5;
const BY_RENDER_CROWDED = 3;
const WIDTH_SLACK = 0.25;
const CLOSE_CALL = 0.1;
const OFFERED = 3;
const HOLLOW_STROKES = [0.025, 0.05];
const HOLLOW_HEAVIER = 2;
const HOLLOW_FIT = Math.log(1.5);

/** How far the glyphs of a span rise above its baseline. */
export const inkTop = (s: SpanInk) =>
  s.ink.body.y + s.ink.body.height - s.baseline;

// Readers judge size by the lowercase, so mostly-lowercase text is sized by
// its x-height; ascenders, overshoot and blur all read taller than the face.
// OCR's letter case is unreliable, so the scan's own rows decide.
export function sizeFor(face: Face, s: SpanInk): number {
  if (s.ink.xLine !== null && /[\p{Lu}\p{Ll}]/u.test(s.original))
    return (s.ink.xLine - s.baseline) / (face.xh / 1000);
  return inkTop(s) / topShare(face, s.original);
}

const preferredFaces = new WeakMap<EditorDocument, string>();
const preferenceListeners = new Set<() => void>();

export function subscribePreferredScanFace(listener: () => void): () => void {
  preferenceListeners.add(listener);
  return () => preferenceListeners.delete(listener);
}

export function preferredScanFace(doc: EditorDocument): string | null {
  return preferredFaces.get(doc) ?? null;
}

export function setPreferredScanFace(
  doc: EditorDocument,
  label: string | null,
): void {
  if (label) preferredFaces.set(doc, label);
  else preferredFaces.delete(doc);
  for (const listener of [...preferenceListeners]) listener();
}

export function preferredStyle(
  doc: EditorDocument,
  ranked: RankedStyle[],
): ScanStyle | null {
  const pick = ranked.find((r) => r.face.label === preferredScanFace(doc));
  if (!pick || pick === ranked[0]) return null;
  return pick.score >= ranked[0].score - CLOSE_CALL ? pick.style : null;
}

interface Candidate {
  face: Face;
  family: string;
  size: number;
  stretch: number;
  k: number;
  softness: number;
  score: number;
  strokeRatio: number;
}

type Cut = Pick<Candidate, "family" | "size" | "stretch">;

const familiesOf = (face: Face) => [...new Set([face.family, face.bold])];

const best = <T extends { score: number }>(cs: T[]) =>
  cs.reduce((p, q) => (q.score > p.score ? q : p));

function nearestOne<T>(items: T[], ratio: (item: T) => number): T {
  return items.reduce((p, q) =>
    Math.abs(Math.log(ratio(q))) < Math.abs(Math.log(ratio(p))) ? q : p,
  );
}

function compare(
  doc: EditorDocument,
  page: Page,
  ref: SpanInk,
  cut: Cut & { weight?: number; hollow?: number },
  softness?: number,
  rough = false,
): ScanMatch {
  return matchScan(
    doc,
    page,
    ref.ink,
    { text: ref.original, x: ref.ink.body.x, baseline: ref.baseline, ...cut },
    softness,
    rough,
  );
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

function halfDensityXHeight(
  doc: EditorDocument,
  page: Page,
  s: SpanInk,
): number | null {
  if (s.ink.xLine === null) return null;
  const rect = s.ink.rect;
  const img = renderLuma(doc.module, page, rect, 0);
  if (!img) return null;
  const { data, width, height } = img;
  const paper = 0.299 * s.paper.r + 0.587 * s.paper.g + 0.114 * s.paper.b;
  let darkest = paper;
  for (let i = 0; i < data.length; i++)
    if (data[i] < darkest) darkest = data[i];
  const depth = Math.max(30, paper - darkest);
  const rows = Array.from({ length: height }, (_, y) => {
    let sum = 0;
    for (let x = 0; x < width; x++)
      sum += Math.max(0, paper - data[y * width + x]);
    return sum / (width * depth);
  });
  const rowOf = (pageY: number) =>
    ((rect.y + rect.height - pageY) / rect.height) * height;
  const xRow = rowOf(s.ink.xLine);
  const baseRow = rowOf(s.baseline);
  const from = Math.round(xRow + (baseRow - xRow) * 0.25);
  const to = Math.round(baseRow - (baseRow - xRow) * 0.25);
  if (to <= from || from < 0 || to >= height) return null;
  const plateau = median(rows.slice(from, to + 1));
  if (plateau <= 0) return null;
  const half = plateau / 2;
  const crossing = (start: number, step: number) => {
    for (let y = start; y >= 0 && y < height; y += step) {
      const next = y + step;
      if (next < 0 || next >= height) return null;
      if (rows[next] < half) {
        const t = (rows[y] - half) / Math.max(1e-6, rows[y] - rows[next]);
        return y + t * step;
      }
    }
    return null;
  };
  const centre = Math.round((from + to) / 2);
  const up = crossing(centre, -1);
  const down = crossing(centre, 1);
  if (up === null || down === null) return null;
  return ((down - up) / height) * rect.height;
}

function widthMisfit(
  doc: EditorDocument,
  page: Page,
  face: Face,
  family: string,
  ref: SpanInk,
  words: FitWord[],
  xHeight: number | null,
): number {
  const size = xHeight ? xHeight / (face.xh / 1000) : sizeFor(face, ref);
  const line = textAdvance(doc, page, face, family, ref.original);
  if (!line || size <= 2) return Infinity;
  const span = Math.min(
    ...SIZE_STEPS.slice(0, 5).map((k) =>
      Math.abs(Math.log(ref.ink.body.width / ((line * size * k) / 1000))),
    ),
  );
  const ratios = words
    .map((w) => {
      const adv = textAdvance(doc, page, face, family, w.text);
      return adv ? w.width / adv : 0;
    })
    .filter((r) => r > 0);
  if (ratios.length < 4) return span;
  const k = median(ratios);
  return span + 2 * median(ratios.map((r) => Math.abs(r / k - 1)));
}

function shortlist(
  doc: EditorDocument,
  page: Page,
  input: FitInput,
  faces: Face[],
  quickScore: (face: Face) => number,
): Face[] {
  const crowded = faces.length > CROWDED;
  const byWidth = crowded ? BY_WIDTH_CROWDED : BY_WIDTH;
  const byRender = crowded ? BY_RENDER_CROWDED : BY_RENDER;
  if (faces.length <= byWidth + byRender) return faces;
  const words = input.words
    .map((w) => ({ text: w.text.trim(), width: w.width }))
    .filter((w) => w.text.length >= 2 && w.width > 0)
    .slice(0, 24);
  const xHeight = halfDensityXHeight(doc, page, input.ref);
  const scored = faces
    .map((face) => ({
      face,
      misfit: Math.min(
        ...familiesOf(face).map((family) =>
          widthMisfit(doc, page, face, family, input.ref, words, xHeight),
        ),
      ),
    }))
    .filter((f) => Number.isFinite(f.misfit))
    .sort((p, q) => p.misfit - q.misfit);
  const plausible = scored.filter(
    (f) => f.misfit <= scored[0].misfit + WIDTH_SLACK,
  );
  const kept = plausible.slice(0, byWidth).map((f) => f.face);
  kept.push(
    ...plausible
      .slice(byWidth)
      .map((f) => ({ face: f.face, score: quickScore(f.face) }))
      .sort((p, q) => q.score - p.score)
      .slice(0, byRender)
      .map((f) => f.face),
  );
  const pick = faces.find((f) => f.label === preferredScanFace(doc));
  if (pick && !kept.includes(pick)) kept.push(pick);
  return kept;
}

export function rankStyles(
  doc: EditorDocument,
  page: Page,
  input: FitInput,
): RankedStyle[] {
  return withScanCache(input.ref.ink, () => rankUncached(doc, page, input));
}

function rankUncached(
  doc: EditorDocument,
  page: Page,
  input: FitInput,
): RankedStyle[] {
  const { ref } = input;
  const fit = (face: Face, family: string, k: number) => {
    const size = sizeFor(face, ref) * k;
    const natural = spanOf(doc, page, ref.original, family, size);
    const stretch = clampStretch(ref.ink.body.width / Math.max(1e-3, natural));
    return { face, family, size, stretch, k };
  };
  // Typewriter evidence is sturdier than pixels on a blurry low-res scan, so
  // it wins close calls.
  const typewriter =
    input.wordsLookMono() || isEvenlySpaced(ref.ink.glyphCenters, ref.original);
  const all = scanFaces().filter((f) => faceCovers(f, ref.original));
  if (all.length === 0) return [];
  const quickScore = (face: Face) =>
    Math.max(
      ...familiesOf(face).map(
        (family) =>
          compare(doc, page, ref, fit(face, family, 0.94), undefined, true)
            .score,
      ),
    );
  const faces = shortlist(doc, page, input, all, quickScore);
  if (typewriter)
    for (const f of all)
      if (f.kind === "mono" && !faces.includes(f)) faces.push(f);
  // Fit size for both weights before choosing one. Blur and overshoot can
  // inflate glyph height enough to favour the wrong face at the initial size.
  const sizes = faces
    .flatMap((face) =>
      familiesOf(face).flatMap((family) =>
        SIZE_STEPS.map((k) => fit(face, family, k)),
      ),
    )
    .filter((c) => c.size > 2)
    .map((c) => ({
      ...c,
      score: compare(doc, page, ref, c, undefined, true).score,
    }));
  if (sizes.length === 0) return [];
  const floor = Math.round(scanPixelSpan(doc, page, ref.ink.rect) / 2);
  // Compare the tuned faces at the scan's softness. Blurring both images
  // gives the scan a second blur, which makes regular strokes look bold.
  const candidates: Candidate[] = faces
    .flatMap((face) =>
      familiesOf(face).map((family) =>
        sizes.filter((c) => c.face === face && c.family === family),
      ),
    )
    .filter((cs) => cs.length > 0)
    .map((cs) => {
      const c = best(cs);
      const measured = softnessOf(doc, page, ref.ink, {
        text: ref.original,
        x: ref.ink.body.x,
        baseline: ref.baseline,
        family: c.family,
        size: c.size,
        stretch: c.stretch,
      });
      const softness = Math.min(2, Math.max(measured, floor));
      const match = compare(doc, page, ref, c, softness);
      return {
        ...c,
        softness,
        score: match.score,
        strokeRatio: match.weight,
      };
    });
  // Regular and bold can have almost the same blurred outlines. Settle close
  // matches using stroke thickness, rather than rewarding blur as extra ink.
  const perFace = faces
    .map((face) => {
      const cuts = candidates.filter((c) => c.face === face);
      if (cuts.length === 0) return null;
      const top = best(cuts);
      const weighted = nearestOne(
        cuts.filter((c) => c.score >= top.score - CLOSE_CALL),
        (c) => c.strokeRatio,
      );
      return { ...weighted, score: top.score };
    })
    .filter((c): c is Candidate => c !== null)
    .sort((p, q) => q.score - p.score);
  if (perFace.length === 0) return [];
  const nudge = (pick: Candidate | undefined) => {
    if (!pick || pick === perFace[0]) return;
    if (pick.score < perFace[0].score - CLOSE_CALL) return;
    perFace.splice(perFace.indexOf(pick), 1);
    perFace.unshift(pick);
  };
  if (typewriter || input.neighboursLookMono())
    nudge(perFace.find((c) => c.face.kind === "mono"));
  nudge(perFace.find((c) => c.face.label === preferredScanFace(doc)));
  return perFace.slice(0, OFFERED).map((c) => ({
    face: c.face,
    score: c.score,
    style: finishStyle(doc, page, input.spans, ref, c),
  }));
}

function finishStyle(
  doc: EditorDocument,
  page: Page,
  spans: SpanInk[],
  ref: SpanInk,
  chosen: Candidate,
): ScanStyle {
  const { softness } = chosen;
  // Blur thickens scanned strokes past any bold; add outline until the drawn
  // strokes, softened the same way, are as thick as the scanned ones.
  // Only past bold: on regular text blur alone would read as extra weight.
  const isBoldCut =
    chosen.family === chosen.face.bold &&
    chosen.face.bold !== chosen.face.family;
  const weight = nearestOne(
    (isBoldCut ? [0, 0.025, 0.05] : [0]).map((k) => {
      const w = k * chosen.size;
      return {
        w,
        ratio: compare(doc, page, ref, { ...chosen, weight: w }, softness, true)
          .weight,
      };
    }),
    (o) => o.ratio,
  ).w;
  const hollow = hollowStroke(doc, page, ref, chosen, weight);
  // One size for every line; the median shrugs off a line of lowercase.
  const blockSizes = spans
    .map((s) => sizeFor(chosen.face, s))
    .filter((v) => v > 2);
  return {
    family: chosen.family,
    fontSize: blockSizes.length ? median(blockSizes) * chosen.k : chosen.size,
    stretch: chosen.stretch,
    // Softened text is blurred again, so it starts from the scan's darkest ink.
    ink: softness > 0 ? ref.ink.core : ref.ink.fill,
    weight: hollow > 0 ? 0 : weight,
    hollow,
    softness,
  };
}

function hollowStroke(
  doc: EditorDocument,
  page: Page,
  ref: SpanInk,
  chosen: Candidate,
  weight: number,
): number {
  const strokeRatio = (extra: { weight?: number; hollow?: number }) =>
    compare(doc, page, ref, { ...chosen, ...extra }, chosen.softness, true)
      .weight;
  if (strokeRatio({ weight }) < HOLLOW_HEAVIER) return 0;
  const fitted = HOLLOW_STROKES.map((k) => k * chosen.size)
    .map((w) => ({ w, misfit: Math.abs(Math.log(strokeRatio({ hollow: w }))) }))
    .reduce((p, q) => (q.misfit < p.misfit ? q : p));
  return fitted.misfit < HOLLOW_FIT ? fitted.w : 0;
}
