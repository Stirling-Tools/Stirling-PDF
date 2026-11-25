import type {
  DrawnGlyph,
  SpaceGlyph,
} from "@editor/tools/pdfTextEditor/pdfium/drawnGlyphs";
import { readingOrder } from "@editor/tools/pdfTextEditor/util/bidi";

export interface DrawnLine {
  /** The line in reading order. */
  text: string;
  /** For each object, the stretch of `text` it draws; an object whose glyphs all sit on another's letters has an empty one after them. */
  spans: Array<{ start: number; end: number }>;
  /** The space objects between the line's glyphs, each with the code unit of `text` it draws. */
  spaces: Array<{ ptr: number; start: number }>;
  /** False when redrawing `text` would not put every glyph back where it is, or an object's glyphs are not one stretch of it. */
  faithful: boolean;
}

/** A glyph of a line with the index of the object drawing it. */
export interface PlacedGlyph extends DrawnGlyph {
  object: number;
}

const ALL_MARKS = /^\p{M}+$/u;
const SAME_LINE_EM = 0.25;

/**
 * The glyphs of a line's objects from left to right. A mark drawn as an
 * object of its own belongs to the letter whose advance it sits in, wherever
 * its pen position sorts: it is folded into that letter, and `riders` gives
 * the letter for each object left without a glyph.
 */
export function placeGlyphs(objects: ReadonlyArray<readonly DrawnGlyph[]>): {
  glyphs: PlacedGlyph[];
  riders: Map<number, PlacedGlyph>;
} {
  const placed = objects
    .flatMap((glyphs, object) => glyphs.map((g) => ({ ...g, object })))
    .sort((a, b) => a.left - b.left);
  const letters = placed.filter(({ text }) => !ALL_MARKS.test(text));
  const riders = new Map<number, PlacedGlyph>();
  if (letters.length === 0) return { glyphs: placed, riders };
  for (const mark of placed) {
    if (!ALL_MARKS.test(mark.text)) continue;
    let host = letters[0];
    for (const letter of letters) {
      if (mark.left >= letter.left && mark.left <= letter.right) {
        host = letter;
        break;
      }
      if (Math.abs(letter.left - mark.left) < Math.abs(host.left - mark.left))
        host = letter;
    }
    host.text += mark.text;
    if (!letters.some((letter) => letter.object === mark.object))
      riders.set(mark.object, host);
  }
  return { glyphs: letters, riders };
}

const BRACKET_PAIRS = ["()", "[]", "{}"];

function nests(brackets: readonly string[], open: string): boolean {
  let depth = 0;
  for (const bracket of brackets) {
    depth += bracket === open ? 1 : -1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

// Drawn left to right, a pair always opens on the left whichever way its text reads. PDFium reports some bracket glyphs by the character they stand for and mirrors others, so a pair it turned is turned back to how it must be drawn.
function facePairedBrackets(drawn: PlacedGlyph[]): void {
  for (const [open, close] of BRACKET_PAIRS) {
    const found = drawn.filter(({ text }) => text === open || text === close);
    const faces = found.map(({ text }) => text);
    if (found.length % 2 === 1 || nests(faces, open)) continue;
    const turned = faces.map((face) => (face === open ? close : open));
    found.forEach((glyph, i) => {
      glyph.text = nests(turned, open) ? turned[i] : i % 2 === 0 ? open : close;
    });
  }
}

/**
 * Read one line from where its glyphs are drawn. `objects` holds each of the
 * line's objects' glyphs, `spaces` the page's space glyphs drawn as objects of
 * their own, and `gapSpaces` says how many spaces a gap between two glyphs
 * with no space glyph in it stands for.
 */
export function readDrawnLine(
  objects: ReadonlyArray<readonly DrawnGlyph[]>,
  spaces: readonly SpaceGlyph[],
  fontSize: number,
  gapSpaces: (gapPt: number) => number,
): DrawnLine {
  const { glyphs: letters, riders } = placeGlyphs(objects);
  const drawn: Array<PlacedGlyph & { ptr?: number }> = [];
  letters.forEach((glyph, i) => {
    const before = letters[i - 1];
    if (before) {
      const between = spaces.filter(
        (space) =>
          space.left > before.left &&
          space.left < glyph.left &&
          Math.abs(space.baseline - glyph.baseline) < SAME_LINE_EM * fontSize,
      );
      for (const space of between) drawn.push({ ...space, object: -1 });
      const inferred =
        between.length > 0 ? 0 : gapSpaces(glyph.left - before.right);
      for (let k = 0; k < inferred; k++)
        drawn.push({
          text: " ",
          object: -1,
          left: before.right,
          right: glyph.left,
          baseline: glyph.baseline,
        });
    }
    drawn.push(glyph);
  });

  facePairedBrackets(drawn);
  const read = readingOrder(drawn.map(({ text }) => text));
  const starts: number[] = [];
  let text = "";
  read.order.forEach((unit, k) => {
    drawn[unit].text = read.texts[k];
    starts[unit] = text.length;
    text += read.texts[k];
  });

  let faithful = read.faithful;
  const spans = objects.map((_, object) => {
    const own = drawn.flatMap((glyph, unit) =>
      glyph.object === object ? [unit] : [],
    );
    if (own.length === 0) {
      const host = riders.get(object);
      if (!host) faithful = false;
      const at = host
        ? starts[drawn.indexOf(host)] + host.text.length
        : text.length;
      return { start: at, end: at };
    }
    return {
      start: Math.min(...own.map((unit) => starts[unit])),
      end: Math.max(
        ...own.map((unit) => starts[unit] + drawn[unit].text.length),
      ),
    };
  });
  drawn.forEach((glyph, unit) => {
    if (glyph.object < 0) return;
    const inside = spans.some(
      (span, object) =>
        object !== glyph.object &&
        starts[unit] >= span.start &&
        starts[unit] < span.end,
    );
    if (inside) faithful = false;
  });
  return {
    text,
    spans,
    spaces: drawn.flatMap((glyph, unit) =>
      glyph.ptr ? [{ ptr: glyph.ptr, start: starts[unit] }] : [],
    ),
    faithful,
  };
}
