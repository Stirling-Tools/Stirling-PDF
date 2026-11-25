/**
 * Editing text that holds right-to-left letters without redrawing it.
 *
 * Such text cannot be rebuilt from its characters: its letters are shaped
 * glyphs of a subset font with no way back from a character to the glyph, and
 * its numbers and Latin words sit where the document's own layout put them. So
 * every object the edit does not touch stays the object the document drew,
 * moved when the text beside it grows, shrinks or breaks onto another line;
 * only the touched stretch is drawn again, in drawn order, and each line keeps
 * the edge it reads from.
 *
 * The text is first matched, glyph by glyph, against its lines laid out with
 * {@link visualOrder}. Text that does not match is not planned at all.
 */
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import type { RGBA } from "@editor/tools/pdfTextEditor/types";
import { readObjFill } from "@editor/tools/pdfTextEditor/pdfium/PdfiumObjectColour";
import {
  tagsAt,
  uniformTags,
  type TextTags,
} from "@editor/tools/pdfTextEditor/model/TextTags";
import {
  collectMemberPtrs,
  contentIndices,
  drawnEndPt,
  emitTextLine,
  inkFromRun,
  measureObjSpanPt,
  objectTexts,
  removeAndDestroyObject,
  removeTextObject,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { indexedInsertOf } from "@editor/tools/pdfTextEditor/util/insertPageObject";
import {
  bestFontPtrForText,
  diffSpan,
} from "@editor/tools/pdfTextEditor/commands/partialEdit";
import {
  readPageGlyphs,
  type DrawnGlyph,
} from "@editor/tools/pdfTextEditor/pdfium/drawnGlyphs";
import {
  placeGlyphs,
  type PlacedGlyph,
} from "@editor/tools/pdfTextEditor/pdfium/drawnLine";
import {
  joinsAt,
  shapeArabic,
} from "@editor/tools/pdfTextEditor/util/arabicShaping";
import { isRtlBase, visualOrder } from "@editor/tools/pdfTextEditor/util/bidi";
import { fallbackFamilyFor } from "@editor/tools/pdfTextEditor/util/fontCapability";
import { transformObject } from "@editor/tools/pdfTextEditor/util/objectTransform";

interface LineObject {
  ptr: number;
  /** Objects with no glyph of their own that go wherever this one goes: the rest of its glyph cluster, marks sitting on its letters. */
  followers: number[];
  /** Its glyphs, by their place in the map. */
  glyphs: number[];
  /** The stretch of the text it draws. */
  start: number;
  end: number;
}

/** A glyph with the line of the text it is drawn on; `object` indexes the map's objects. */
interface LineGlyph extends PlacedGlyph {
  line: number;
}

interface Row {
  baseline: number;
  left: number;
  right: number;
}

interface DrawnMap {
  /** Every glyph, line after line and left to right within each. */
  glyphs: LineGlyph[];
  /** The glyph drawing each code unit of the text; -1 for a space, line break or control no glyph draws. */
  glyphOf: number[];
  objects: LineObject[];
  /** Where each line of the text is drawn; null for a line that draws nothing. */
  rows: Array<Row | null>;
}

type Token =
  | { kind: "glyph"; glyph: number }
  | { kind: "free"; unit: number }
  | {
      kind: "new";
      char: string;
      rightToLeft: boolean;
      start: number;
      end: number;
    };

type Item =
  | { kind: "kept"; first: number; last: number }
  | { kind: "space"; width: number }
  | { kind: "word"; text: string; start: number; end: number };

interface PlannedLine {
  items: Item[];
  baseline: number;
  /** The edge the line is set from: its right when the text reads right to left, else its left. */
  anchor: number;
  start: number;
  text: string;
}

export interface BidiLineEditPlan {
  /** Every object of the run, for the caller to remember where each sat. */
  ptrs: number[];
  /** The objects the edit takes off the page. */
  removePtrs: number[];
  map: DrawnMap;
  lines: PlannedLine[];
  next: string;
  start: number;
  shift: number;
  prevEnd: number;
  rightToLeft: boolean;
}

/** One line of the run after the edit: its objects in reading order with the text each draws. */
export interface EditedLine {
  ptrs: number[];
  texts: string[];
  charStarts: number[];
  bounds: Array<{ x: number; right: number }>;
  text: string;
  x: number;
  y: number;
}

export interface BidiLineEditResult {
  insertedPtrs: number[];
  lines: EditedLine[];
  left: number;
  right: number;
}

const SAME_PEN_PT = 0.01;
const BRACKETS = "()[]{}";
// Letters that take a different form beside one another, the marks between them, and the tatweel that joins both ways.
const JOINING = /[ؠ-ٟٮ-ۓۺ-ۼ]/;
const UNDRAWN = /[\s\p{Cf}]/u;
const FALLBACK_SPACE_EM = 0.27;
const MIN_SPACE_SHARE = 0.3;
const DEFAULT_LEADING = 1.2;
const PARKED_BELOW_PAGE_EM = 20;
// Glyphs of one line can sit a little off its baseline; the next line is a whole line away.
const ONE_LINE_EM = 0.6;

// The letters of a text whatever order and form they are drawn in: a shaped letter is its plain one, a bracket either of its pair.
function lettersKey(text: string): string {
  return [...text.normalize("NFKC").replace(/[\s\p{Cf}]/gu, "")]
    .map((ch) =>
      BRACKETS.includes(ch) ? BRACKETS[BRACKETS.indexOf(ch) & ~1] : ch,
    )
    .sort()
    .join("");
}

function sameGlyphText(drawn: string, text: string): boolean {
  return drawn === text || lettersKey(drawn) === lettersKey(text);
}

// How many drawn positions from `at` the glyph covers when it shows the text there; 0 when it does not.
function glyphSpan(
  glyph: PlacedGlyph,
  text: string,
  order: readonly number[],
  at: number,
): number {
  for (const length of new Set([
    glyph.text.length,
    glyph.text.normalize("NFKC").length,
  ])) {
    const units = order.slice(at, at + length);
    if (units.length < length) continue;
    const low = Math.min(...units);
    if (Math.max(...units) - low + 1 !== length) continue;
    if (sameGlyphText(glyph.text, text.slice(low, low + length))) return length;
  }
  return 0;
}

// Of two spaces side by side where the page draws one space glyph, the first is the gap before the glyph when there is one, not the glyph.
function spaceBeforeGlyph(
  text: string,
  order: readonly number[],
  at: number,
  glyphs: readonly PlacedGlyph[],
  next: number,
): boolean {
  const glyph = glyphs[next];
  const before = glyphs[next - 1];
  if (!before || glyph.text !== " " || at + 1 >= order.length) return false;
  if (!/\s/.test(text[order[at]]) || !/\s/.test(text[order[at + 1]]))
    return false;
  return glyph.left - before.right >= (glyph.right - glyph.left) / 2;
}

// The glyph drawing each code unit of the line `text`, or null when the glyphs from left to right are not `text` as visualOrder lays it out.
function matchGlyphs(text: string, glyphs: PlacedGlyph[]): number[] | null {
  const { order } = visualOrder(text, isRtlBase(text));
  const glyphOf = new Array<number>(text.length).fill(-1);
  let next = 0;
  let at = 0;
  while (at < order.length) {
    const glyph = glyphs[next];
    let span = glyph ? glyphSpan(glyph, text, order, at) : 0;
    const tied = glyphs[next + 1];
    // Two glyphs drawn from the same pen position sort either way.
    if (
      span === 0 &&
      glyph &&
      tied &&
      Math.abs(tied.left - glyph.left) < SAME_PEN_PT &&
      glyphSpan(tied, text, order, at) > 0
    ) {
      glyphs[next] = tied;
      glyphs[next + 1] = glyph;
      span = glyphSpan(tied, text, order, at);
    }
    if (span > 0 && !spaceBeforeGlyph(text, order, at, glyphs, next)) {
      for (let k = 0; k < span; k++) glyphOf[order[at + k]] = next;
      next++;
      at += span;
    } else if (UNDRAWN.test(text[order[at]])) at++;
    else return null;
  }
  return next === glyphs.length ? glyphOf : null;
}

// Only the stretches drawn anew are shaped: a kept letter is a glyph already, and shaping it could merge it with its neighbour into one ligature.
function shapeAnew(
  text: string,
  anew: (unit: number) => boolean,
): { text: string; source: number[]; sourceEnd: number[] } {
  const out = { text: "", source: [] as number[], sourceEnd: [] as number[] };
  let unit = 0;
  while (unit < text.length) {
    let end = unit + 1;
    if (!anew(unit)) {
      out.text += text[unit];
      out.source.push(unit);
      out.sourceEnd.push(end);
    } else {
      while (end < text.length && anew(end)) end++;
      const shaped = shapeArabic(text.slice(unit, end));
      out.text += shaped.text;
      for (const source of shaped.source) out.source.push(source + unit);
      for (const source of shaped.sourceEnd) out.sourceEnd.push(source + unit);
    }
    unit = end;
  }
  return out;
}

function lineStarts(text: string): Array<{ start: number; text: string }> {
  let start = 0;
  return text.split("\n").map((line) => {
    const at = start;
    start += line.length + 1;
    return { start: at, text: line };
  });
}

function readDrawnMap(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
  text: string,
): DrawnMap | null {
  const m = doc.module;
  const textPage = m.FPDFText_LoadPage(page.pagePtr);
  if (!textPage) return null;
  let pageGlyphs;
  try {
    pageGlyphs = readPageGlyphs(m, textPage);
  } finally {
    m.FPDFText_ClosePage(textPage);
  }
  if (!pageGlyphs) return null;
  const objects: LineObject[] = [];
  const drawn: DrawnGlyph[][] = [];
  for (const ptr of collectMemberPtrs(run)) {
    const own = pageGlyphs.byObject.get(ptr);
    if (own?.length) {
      objects.push({ ptr, followers: [], glyphs: [], start: Infinity, end: 0 });
      drawn.push(own);
    } else if (objects.length > 0)
      objects[objects.length - 1].followers.push(ptr);
    else return null;
  }
  const oneLine = ONE_LINE_EM * Math.max(run.fontSize, 4);
  const bands: Array<{ baseline: number; objects: number[] }> = [];
  for (const [object, own] of drawn.entries()) {
    const rest =
      own.length === 1 ? measureObjSpanPt(m, objects[object].followers) : null;
    if (rest) {
      own[0].left = Math.min(own[0].left, rest.left);
      own[0].right = Math.max(own[0].right, rest.right);
    }
    const { baseline } = own[0];
    if (own.some((glyph) => Math.abs(glyph.baseline - baseline) > oneLine))
      return null;
    const band = bands.find((b) => Math.abs(b.baseline - baseline) <= oneLine);
    if (band) band.objects.push(object);
    else bands.push({ baseline, objects: [object] });
  }
  bands.sort((a, b) => b.baseline - a.baseline);

  const lines = lineStarts(text);
  const inked = lines.filter((line) =>
    [...line.text].some((ch) => !UNDRAWN.test(ch)),
  );
  if (bands.length !== inked.length || inked.length === 0) return null;
  const map: DrawnMap = {
    glyphs: [],
    glyphOf: new Array<number>(text.length).fill(-1),
    objects,
    rows: lines.map(() => null),
  };
  for (const [index, line] of lines.entries()) {
    const band = bands[inked.indexOf(line)];
    if (!band) continue;
    const { glyphs, riders } = placeGlyphs(
      band.objects.map((object) => drawn[object]),
    );
    const glyphOf = matchGlyphs(line.text, glyphs);
    if (!glyphOf) return null;
    const first = map.glyphs.length;
    for (const glyph of glyphs)
      map.glyphs.push({
        ...glyph,
        object: band.objects[glyph.object],
        line: index,
      });
    glyphOf.forEach((glyph, unit) => {
      if (glyph >= 0) map.glyphOf[line.start + unit] = first + glyph;
    });
    for (const [rider, host] of riders) {
      const riding = objects[band.objects[rider]];
      objects[band.objects[host.object]].followers.push(
        riding.ptr,
        ...riding.followers,
      );
      riding.followers = [];
    }
    map.rows[index] = {
      baseline: band.baseline,
      left: Math.min(...glyphs.map((glyph) => glyph.left)),
      right: Math.max(...glyphs.map((glyph) => glyph.right)),
    };
  }
  map.glyphs.forEach((glyph, i) => objects[glyph.object].glyphs.push(i));
  map.glyphOf.forEach((glyph, unit) => {
    if (glyph < 0) return;
    const object = objects[map.glyphs[glyph].object];
    object.start = Math.min(object.start, unit);
    object.end = Math.max(object.end, unit + 1);
  });
  // An object is moved or redrawn whole, so the text it draws has to be one stretch no other object draws into.
  for (let unit = 0; unit < text.length; unit++) {
    if (map.glyphOf[unit] < 0) continue;
    const owner = objects[map.glyphs[map.glyphOf[unit]].object];
    if (
      objects.some(
        (o) =>
          o !== owner && o.glyphs.length > 0 && unit >= o.start && unit < o.end,
      )
    )
      return null;
  }
  return map;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

// The spaces and controls no glyph draws that sit between each glyph and the one drawn after it on its line, with the width each space takes of the gap. The text page's box for a glyph can run on over the gap after it; a space the text holds is then given a plain space's width back out of that box.
function freeUnits(
  text: string,
  map: DrawnMap,
  spaceWidth: number,
): { between: number[][]; widths: Map<number, number> } {
  const between: number[][] = map.glyphs.map(() => []);
  const widths = new Map<number, number>();
  for (const line of lineStarts(text)) {
    let last = -1;
    for (const at of visualOrder(line.text, isRtlBase(line.text)).order) {
      const glyph = map.glyphOf[line.start + at];
      if (glyph >= 0) last = glyph;
      else if (last >= 0) between[last].push(line.start + at);
    }
  }
  between.forEach((units, i) => {
    const glyph = map.glyphs[i];
    const after = map.glyphs[i + 1];
    const spaces = units.filter((unit) => /\s/.test(text[unit]));
    if (spaces.length === 0 || after?.line !== glyph.line) return;
    let width = (after.left - glyph.right) / spaces.length;
    if (width < MIN_SPACE_SHARE * spaceWidth) {
      width = spaceWidth;
      glyph.right = Math.max(glyph.left, after.left - spaces.length * width);
    }
    for (const unit of spaces) widths.set(unit, width);
  });
  return { between, widths };
}

// Removing or adding a stretch that repeats the text before it reads as any of several equal edits. The one starting at a word's start leaves the letters around it joined as they were.
function wordAlignedDiff(
  prev: string,
  next: string,
): { start: number; prevEnd: number; nextEnd: number } {
  const span = diffSpan(prev, next);
  if (span.nextEnd !== span.start && span.prevEnd !== span.start) return span;
  const text = span.nextEnd === span.start ? prev : next;
  const end = Math.max(span.prevEnd, span.nextEnd);
  for (let back = 0; back <= span.start; back++) {
    const start = span.start - back;
    if (back > 0 && text[start] !== text[end - back]) break;
    if (start === 0 || /\s/.test(text[start - 1]))
      return {
        start,
        prevEnd: span.prevEnd - back,
        nextEnd: span.nextEnd - back,
      };
  }
  return span;
}

function sameUnits(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((unit, i) => unit === b[i]);
}

/**
 * Plan an edit of a run from `prev` to `next` that keeps every object it can.
 * Null when the run's objects do not draw `prev` the way it lays out, or the
 * edit leaves nothing to keep; nothing on the page is touched either way.
 */
export function planBidiLineEdit(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
  prev: string,
  next: string,
): BidiLineEditPlan | null {
  if (/\r/.test(prev) || /\r/.test(next)) return null;
  const map = readDrawnMap(doc, page, run, prev);
  if (!map) return null;
  const fontSize = Math.max(run.fontSize, 4);
  const free = freeUnits(prev, map, FALLBACK_SPACE_EM * fontSize);
  // A glyph ends where the one drawn against it starts: the text page's own box for it is only near that, and two stretches set apart and back together would not meet where they did.
  map.glyphs.forEach((glyph, i) => {
    const after = map.glyphs[i + 1];
    if (after?.line === glyph.line && free.between[i].length === 0)
      glyph.right = after.left;
  });
  const { start, prevEnd, nextEnd } = wordAlignedDiff(prev, next);
  const shift = nextEnd - prevEnd;
  const toNext = (unit: number) =>
    unit < start ? unit : unit >= prevEnd ? unit + shift : -1;
  const toPrev = (unit: number) =>
    unit < start ? unit : unit >= nextEnd ? unit - shift : -1;
  const anew = Array.from(next, (_, unit) => unit >= start && unit < nextEnd);
  const touched = new Set<LineObject>();
  const touch = (object: LineObject): boolean => {
    if (touched.has(object)) return false;
    touched.add(object);
    for (let unit = object.start; unit < object.end; unit++)
      if (toNext(unit) >= 0) anew[toNext(unit)] = true;
    return true;
  };
  const objectAt = (unit: number): LineObject | null =>
    map.glyphOf[unit] >= 0
      ? map.objects[map.glyphs[map.glyphOf[unit]].object]
      : null;
  for (const object of map.objects) {
    if (object.glyphs.length === 0) continue;
    const cut = object.start < prevEnd && object.end > start && prevEnd > start;
    if (cut || (object.start < start && start < object.end)) touch(object);
  }
  // A letter that joined a removed neighbour, or now joins a new one, changes form, and its word with it.
  const touchWord = (from: number, step: 1 | -1): boolean => {
    let changed = false;
    for (
      let unit = from;
      unit >= 0 && unit < prev.length && JOINING.test(prev[unit]);
      unit += step
    ) {
      const object = objectAt(unit);
      if (object) changed = touch(object) || changed;
      else if (!anew[toNext(unit)]) {
        anew[toNext(unit)] = true;
        changed = true;
      }
    }
    return changed;
  };
  if (joinsAt(prev, start)) touchWord(start - 1, -1);
  if (joinsAt(prev, prevEnd)) touchWord(prevEnd, 1);

  const prevMirrored = new Map<number, boolean>();
  for (const line of lineStarts(prev)) {
    const drawn = visualOrder(line.text, isRtlBase(line.text));
    drawn.order.forEach((unit, at) =>
      prevMirrored.set(line.start + unit, drawn.visual[at] !== line.text[unit]),
    );
  }
  const nextLines = lineStarts(next);
  // A kept object must still be drawn as it was: each glyph straight after the one it followed, a bracket facing the way it did.
  const layOut = (): { lines: Token[][]; disturbed: LineObject[] } => {
    const disturbed: LineObject[] = [];
    const seen = new Map<LineObject, number>();
    const lines = nextLines.map((line) => {
      const shaped = shapeAnew(line.text, (unit) => anew[line.start + unit]);
      const drawn = visualOrder(shaped.text, isRtlBase(line.text));
      const tokens: Token[] = [];
      let before: Token | null = null;
      drawn.order.forEach((at, position) => {
        const unit = line.start + shaped.source[at];
        if (anew[unit]) {
          before = {
            kind: "new",
            char: drawn.visual[position],
            rightToLeft: drawn.rightToLeft[position],
            start: unit,
            end: line.start + shaped.sourceEnd[at],
          };
          tokens.push(before);
          return;
        }
        const glyph = map.glyphOf[toPrev(unit)];
        if (glyph < 0) {
          tokens.push({ kind: "free", unit: toPrev(unit) });
          return;
        }
        const object = map.objects[map.glyphs[glyph].object];
        const mirrored = drawn.visual[position] !== shaped.text[at];
        if (prevMirrored.get(toPrev(unit)) !== mirrored) disturbed.push(object);
        if (before?.kind === "glyph" && before.glyph === glyph) return;
        const count = seen.get(object) ?? 0;
        const follows =
          count === 0 ||
          (before?.kind === "glyph" && before.glyph === glyph - 1);
        if (!follows || object.glyphs[count] !== glyph) disturbed.push(object);
        seen.set(object, count + 1);
        before = { kind: "glyph", glyph };
        tokens.push(before);
      });
      return tokens;
    });
    return { lines, disturbed };
  };
  let { lines, disturbed } = layOut();
  for (let round = 0; round <= map.objects.length; round++) {
    let changed = false;
    for (let unit = 1; unit < next.length; unit++) {
      if (anew[unit - 1] === anew[unit] || !joinsAt(next, unit)) continue;
      const kept = anew[unit] ? unit - 1 : unit;
      if (touchWord(toPrev(kept), anew[unit] ? -1 : 1)) changed = true;
    }
    for (const object of disturbed) if (touch(object)) changed = true;
    if (!changed) break;
    ({ lines, disturbed } = layOut());
  }
  if (touched.size === map.objects.filter((o) => o.glyphs.length > 0).length)
    return null;

  const spaceWidth =
    median([...free.widths.values()]) ?? FALLBACK_SPACE_EM * fontSize;
  const itemsOf = (tokens: Token[]): Item[] => {
    const items: Item[] = [];
    let pending: number[] = [];
    let wordRightToLeft = false;
    const flush = () => {
      for (const unit of pending)
        if (/\s/.test(prev[unit]))
          items.push({
            kind: "space",
            width: free.widths.get(unit) ?? spaceWidth,
          });
      pending = [];
    };
    for (const token of tokens) {
      const last = items[items.length - 1];
      if (token.kind === "free") {
        pending.push(token.unit);
      } else if (token.kind === "glyph") {
        if (
          last?.kind === "kept" &&
          last.last === token.glyph - 1 &&
          map.glyphs[last.last].line === map.glyphs[token.glyph].line &&
          sameUnits(pending, free.between[last.last])
        ) {
          last.last = token.glyph;
          pending = [];
        } else {
          flush();
          items.push({ kind: "kept", first: token.glyph, last: token.glyph });
        }
      } else if (/\s/.test(token.char)) {
        flush();
        items.push({ kind: "space", width: spaceWidth });
      } else if (!UNDRAWN.test(token.char)) {
        const joinsWord =
          pending.length === 0 &&
          last?.kind === "word" &&
          wordRightToLeft === token.rightToLeft;
        flush();
        if (joinsWord && last?.kind === "word") {
          last.text += token.char;
          last.start = Math.min(last.start, token.start);
          last.end = Math.max(last.end, token.end);
        } else {
          items.push({
            kind: "word",
            text: token.char,
            start: token.start,
            end: token.end,
          });
          wordRightToLeft = token.rightToLeft;
        }
      }
    }
    flush();
    // A space at either end of a line draws nothing and was never part of its extent.
    while (items[0]?.kind === "space") items.shift();
    while (items[items.length - 1]?.kind === "space") items.pop();
    return items;
  };

  const rightToLeft = isRtlBase(prev);
  const leading =
    run.paragraphLineHeight > 0
      ? run.paragraphLineHeight
      : run.fontSize * DEFAULT_LEADING;
  const firstRow = map.rows.find((row) => row !== null)!;
  let row = firstRow;
  let baseline = run.matrix.f;
  const planned: PlannedLine[] = nextLines.map((line, index) => {
    // A line is set from the edge of the line its first kept letter came from, so a line the edit leaves alone stays put.
    for (let unit = line.start; unit < line.start + line.text.length; unit++) {
      const glyph = anew[unit] ? -1 : map.glyphOf[toPrev(unit)];
      if (glyph < 0) continue;
      row = map.rows[map.glyphs[glyph].line] ?? row;
      break;
    }
    baseline =
      map.rows[index]?.baseline ??
      (index === 0 ? baseline : baseline - leading);
    return {
      items: itemsOf(lines[index]),
      baseline,
      anchor: rightToLeft ? row.right : row.left,
      start: line.start,
      text: line.text,
    };
  });
  return {
    ptrs: [
      ...new Set(
        map.objects.flatMap(({ ptr, followers }) => [ptr, ...followers]),
      ),
    ],
    removePtrs: [...touched].flatMap(({ ptr, followers }) => [
      ptr,
      ...followers,
    ]),
    map,
    lines: planned,
    next,
    start,
    shift,
    prevEnd,
    rightToLeft,
  };
}

/** Whether every letter of `text` is among those the objects draw, counted. */
export function drawsLetters(
  m: WrappedPdfiumModule,
  page: Page,
  ptrs: readonly number[],
  text: string,
): boolean {
  const wanted = lettersKey(text);
  if (wanted === "") return true;
  const drawn = ptrs.length > 0 ? objectTexts(m, page.pagePtr, ptrs) : null;
  if (drawn === null) return false;
  const left = new Map<string, number>();
  for (const ch of lettersKey(drawn.join("")))
    left.set(ch, (left.get(ch) ?? 0) + 1);
  for (const ch of wanted) {
    const count = left.get(ch) ?? 0;
    if (count === 0) return false;
    left.set(ch, count - 1);
  }
  return true;
}

/** Whether the objects draw every letter of `text`, in any order. An emit that finds no font for a letter leaves it out without saying so. */
export function drawsWhole(
  m: WrappedPdfiumModule,
  page: Page,
  ptrs: readonly number[],
  text: string,
): boolean {
  const drawn = ptrs.length > 0 ? objectTexts(m, page.pagePtr, ptrs) : null;
  return drawn !== null && lettersKey(drawn.join("")) === lettersKey(text);
}

type Word = Extract<Item, { kind: "word" }>;

// The code unit of the text before the edit that the one at `unit` after it came from, or the first one past the edit when it is new.
function sourceUnit(plan: BidiLineEditPlan, unit: number): number {
  if (unit < plan.start) return unit;
  return Math.max(plan.prevEnd, unit - plan.shift);
}

// Text extraction and screen readers follow content order, so a new stretch goes straight after the object drawing the text before it, not at the end of the page.
function placeInReadingOrder(
  m: WrappedPdfiumModule,
  pagePtr: number,
  plan: BidiLineEditPlan,
  words: ReadonlyMap<Word, { ptrs: number[] }>,
): void {
  const insertAt = indexedInsertOf(m);
  if (!insertAt) return;
  const { map } = plan;
  const removed = new Set(plan.removePtrs);
  const keptObject = (unit: number): LineObject | null => {
    const glyph = map.glyphOf[unit] ?? -1;
    const object = glyph >= 0 ? map.objects[map.glyphs[glyph].object] : null;
    return object && !removed.has(object.ptr) ? object : null;
  };
  const drawn = [...words]
    .filter(([, word]) => word.ptrs.length > 0)
    .sort(([a], [b]) => a.start - b.start);
  let last: { anchor: LineObject; ptr: number } | null = null;
  for (const [item, word] of drawn) {
    const from = sourceUnit(plan, item.start);
    let anchor: LineObject | null = null;
    for (let unit = from - 1; unit >= 0 && !anchor; unit--)
      anchor = keptObject(unit);
    const after = anchor !== null;
    for (let unit = from; unit < map.glyphOf.length && !anchor; unit++)
      anchor = keptObject(unit);
    if (!anchor) continue;
    for (const ptr of word.ptrs) m.FPDFPage_RemoveObject(pagePtr, ptr);
    // An object and the ones drawing the rest of its glyph cluster sit together in content order; nothing goes between them.
    const cluster =
      after && last?.anchor === anchor
        ? [last.ptr]
        : [anchor.ptr, ...anchor.followers];
    const indices = [...contentIndices(m, pagePtr, cluster).values()];
    const index =
      indices.length === 0
        ? undefined
        : after
          ? Math.max(...indices) + 1
          : Math.min(...indices);
    word.ptrs.forEach((ptr, i) => {
      if (index === undefined || !insertAt(pagePtr, ptr, index + i))
        m.FPDFPage_InsertObject(pagePtr, ptr);
    });
    if (after) last = { anchor, ptr: word.ptrs[word.ptrs.length - 1] };
  }
}

function objectFont(m: WrappedPdfiumModule, ptr: number): number {
  try {
    return m.FPDFTextObj_GetFont(ptr);
  } catch {
    return 0;
  }
}

/**
 * Carry out a plan: draw the new stretches, take the touched objects off the
 * page and move the kept objects to where the edited text puts them.
 *
 * Null, with the page as it was, when a stretch holding letters the document
 * drew cannot be drawn again whole: no loaded font has them in the form they
 * now take.
 */
export function applyBidiLineEdit(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
  prev: string,
  plan: BidiLineEditPlan,
  tags: TextTags,
): BidiLineEditResult | null {
  const m = doc.module;
  const { map, next } = plan;
  const drawing = map.objects.filter((object) => object.glyphs.length > 0);
  const texts = drawing.map((object) => prev.slice(object.start, object.end));
  const size = Math.max(4, run.fontSize);
  const fallbackFamily = fallbackFamilyFor(run.fontId);
  const toPrev = (unit: number) =>
    unit < plan.start
      ? unit
      : unit - plan.shift >= plan.prevEnd
        ? unit - plan.shift
        : -1;
  const sourceGlyph = (unit: number) =>
    toPrev(unit) >= 0 ? map.glyphOf[toPrev(unit)] : -1;
  const sourceObjectOf = (word: Word): number => {
    for (let unit = word.start; unit < word.end; unit++)
      if (sourceGlyph(unit) >= 0)
        return map.objects[map.glyphs[sourceGlyph(unit)].object].ptr;
    return 0;
  };
  // A redrawn letter keeps the font and fill of the object that drew it; a typed one takes the font of the piece sharing most of its letters.
  const fillFor = (word: Word): RGBA => {
    const source = sourceObjectOf(word);
    return (source ? readObjFill(m, source) : null) ?? run.fill;
  };
  const fontFor = (word: Word): number => {
    const source = sourceObjectOf(word);
    if (source) return objectFont(m, source);
    return bestFontPtrForText(
      m,
      drawing.map(({ ptr }) => ptr),
      texts,
      next.slice(word.start, word.end),
    );
  };
  // A new stretch is drawn clear of the page and of every other one, then moved into place: read back where it lands on letters still drawn there, PDFium takes the doubled letters for one and the stretch for misdrawn.
  const parkedX = Math.min(...map.glyphs.map((glyph) => glyph.left));
  const parkedY = (index: number) => -PARKED_BELOW_PAGE_EM * size * (index + 1);
  const words = new Map<
    Word,
    { ptrs: number[]; width: number; parkedY: number }
  >();
  const dropEmitted = () => {
    for (const word of words.values())
      for (const ptr of word.ptrs) removeAndDestroyObject(m, page.pagePtr, ptr);
  };
  for (const line of plan.lines) {
    for (const item of line.items) {
      if (item.kind !== "word") continue;
      const drawn: string[] = [];
      const ptrs = emitTextLine({
        doc,
        page,
        text: item.text,
        x: parkedX,
        y: parkedY(words.size),
        fontSize: run.fontSize,
        fill: fillFor(item),
        ...inkFromRun(run),
        originalFontPtr: fontFor(item),
        originalFontSubset: run.fontSubset,
        originalFontForCoveredWords: true,
        fallbackFamily,
        charSpacingPt: run.charSpacingPt,
        tags: uniformTags(tagsAt(tags, item.start)),
        drawnInOrder: true,
        outTexts: drawn,
      });
      words.set(item, {
        ptrs,
        width:
          ptrs.length > 0
            ? Math.max(0, drawnEndPt(m, ptrs, drawn, size) - parkedX)
            : 0,
        parkedY: parkedY(words.size),
      });
      const redrawn = Array.from({ length: item.end - item.start }, (_, i) =>
        sourceGlyph(item.start + i),
      ).some((glyph) => glyph >= 0);
      if (redrawn && !drawsWhole(m, page, ptrs, item.text)) {
        dropEmitted();
        return null;
      }
    }
  }
  for (const ptr of plan.removePtrs) removeTextObject(m, page, ptr, 0);

  const widthOf = (item: Item): number =>
    item.kind === "space"
      ? item.width
      : item.kind === "word"
        ? words.get(item)!.width
        : map.glyphs[item.last].right - map.glyphs[item.first].left;
  interface Piece {
    ptrs: number[];
    text: string;
    start: number;
    left: number;
    right: number;
  }
  const result: BidiLineEditResult = {
    insertedPtrs: [...words.values()].flatMap(({ ptrs }) => ptrs),
    lines: [],
    left: Infinity,
    right: -Infinity,
  };
  for (const line of plan.lines) {
    const total = line.items.reduce((sum, item) => sum + widthOf(item), 0);
    let pen = plan.rightToLeft ? line.anchor - total : line.anchor;
    const pieces: Piece[] = [];
    const moved = new Set<LineObject>();
    for (const item of line.items) {
      if (item.kind === "word") {
        const { ptrs, parkedY: from } = words.get(item)!;
        for (const ptr of ptrs)
          transformObject(
            m,
            ptr,
            1,
            0,
            0,
            1,
            pen - parkedX,
            line.baseline - from,
          );
        const span = measureObjSpanPt(m, ptrs);
        if (ptrs.length > 0)
          pieces.push({
            ptrs,
            text: next.slice(item.start, item.end),
            start: item.start,
            left: span?.left ?? pen,
            right: span?.right ?? pen,
          });
      } else if (item.kind === "kept") {
        const dx = pen - map.glyphs[item.first].left;
        for (let rank = item.first; rank <= item.last; rank++) {
          const glyph = map.glyphs[rank];
          const object = map.objects[glyph.object];
          if (moved.has(object)) continue;
          moved.add(object);
          const dy = line.baseline - map.rows[glyph.line]!.baseline;
          if (Math.abs(dx) >= SAME_PEN_PT || Math.abs(dy) >= SAME_PEN_PT)
            for (const ptr of [object.ptr, ...object.followers])
              transformObject(m, ptr, 1, 0, 0, 1, dx, dy);
          pieces.push({
            ptrs: [object.ptr, ...object.followers],
            text: prev.slice(object.start, object.end),
            start:
              object.start < plan.start
                ? object.start
                : object.start + plan.shift,
            left: map.glyphs[object.glyphs[0]].left + dx,
            right:
              map.glyphs[object.glyphs[object.glyphs.length - 1]].right + dx,
          });
        }
      }
      pen += widthOf(item);
    }
    pieces.sort((a, b) => a.start - b.start);
    const edited: EditedLine = {
      ptrs: [],
      texts: [],
      charStarts: [],
      bounds: [],
      text: line.text,
      x: pieces.length > 0 ? Math.min(...pieces.map((p) => p.left)) : pen,
      y: line.baseline,
    };
    for (const piece of pieces) {
      piece.ptrs.forEach((ptr, i) => {
        edited.ptrs.push(ptr);
        edited.texts.push(i === 0 ? piece.text : "");
        edited.charStarts.push(
          piece.start - line.start + (i === 0 ? 0 : piece.text.length),
        );
        edited.bounds.push({ x: piece.left, right: piece.right });
      });
      result.left = Math.min(result.left, piece.left);
      result.right = Math.max(result.right, piece.right);
    }
    result.lines.push(edited);
  }
  placeInReadingOrder(m, page.pagePtr, plan, words);
  return result;
}
