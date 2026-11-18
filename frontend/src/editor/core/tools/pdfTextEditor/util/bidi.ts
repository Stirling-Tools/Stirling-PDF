/**
 * Logical-to-visual reordering for one line of text, following the Unicode
 * Bidirectional Algorithm (UAX #9) closely enough for plain paragraphs: base
 * direction from the first strong character, levels for strong, number and
 * neutral characters, reversal by level, and mirrored brackets. It does not
 * handle explicit embedding controls or isolates.
 *
 * A PDF draws a text object's glyphs left to right in content order, so
 * right-to-left text has to be written in visual order; readers reorder it
 * back to logical order when extracting.
 */

const RTL = /[\u0590-\u08ff\u200f\ufb1d-\ufdff\ufe70-\ufefc]/;
const MIRRORED: Record<string, string> = {
  "(": ")",
  ")": "(",
  "[": "]",
  "]": "[",
  "{": "}",
  "}": "{",
  "<": ">",
  ">": "<",
  "«": "»",
  "»": "«",
  "‹": "›",
  "›": "‹",
};
const OPENING_BRACKET: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
};
const CLOSING_BRACKET: Record<string, string> = {
  ")": "(",
  "]": "[",
  "}": "{",
};
// UAX #9 BD16 caps the stack of open brackets; a deeper nest is left unpaired.
const MAX_OPEN_BRACKETS = 63;

/** UAX #9 character classes; explicit embeddings and isolates are read as BN, paragraph and segment separators as WS. */
type BidiClass =
  | "L"
  | "R"
  | "AL"
  | "EN"
  | "ES"
  | "ET"
  | "AN"
  | "CS"
  | "NSM"
  | "BN"
  | "WS"
  | "ON";

const COMBINING_MARK = /\p{M}/u;
const NONSPACING_MARK = /[\p{Mn}\p{Me}]/u;
const LETTER = /\p{L}/u;
const CURRENCY = /\p{Sc}/u;
const SPACE_SEPARATOR = /\p{Zs}/u;
const FORMAT_CONTROL = /\p{Cf}/u;

function asciiClass(cp: number): BidiClass {
  if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) return "L";
  if (cp >= 0x30 && cp <= 0x39) return "EN";
  if (cp === 0x2b || cp === 0x2d) return "ES";
  if (cp >= 0x23 && cp <= 0x25) return "ET";
  if (cp === 0x2c || cp === 0x2e || cp === 0x2f || cp === 0x3a) return "CS";
  if (cp === 0x20 || (cp >= 0x09 && cp <= 0x0d)) return "WS";
  return cp < 0x20 || cp === 0x7f ? "BN" : "ON";
}

function arabicClass(cp: number): BidiClass {
  if (cp <= 0x0605 || cp === 0x06dd || cp === 0x08e2) return "AN";
  if (cp >= 0x0660 && cp <= 0x0669) return "AN";
  if (cp === 0x066b || cp === 0x066c) return "AN";
  if (cp >= 0x06f0 && cp <= 0x06f9) return "EN";
  if (cp === 0x0609 || cp === 0x060a || cp === 0x066a) return "ET";
  if (cp === 0x060c) return "CS";
  if (cp === 0x0606 || cp === 0x0607 || cp === 0x060e || cp === 0x060f)
    return "ON";
  if (cp === 0x06de || cp === 0x06e9) return "ON";
  return "AL";
}

function classOf(ch: string): BidiClass {
  const cp = ch.codePointAt(0)!;
  if (cp < 0x80) return asciiClass(cp);
  if (cp === 0x200e) return "L";
  if (cp === 0x200f) return "R";
  if (NONSPACING_MARK.test(ch)) return "NSM";
  if (cp >= 0x0590 && cp <= 0x05ff) return "R";
  if (cp >= 0x0600 && cp <= 0x07bf) return arabicClass(cp);
  if (cp >= 0x07c0 && cp <= 0x085f) return "R";
  if (cp >= 0x0860 && cp <= 0x08ff) return arabicClass(cp);
  if (cp >= 0xfb1d && cp <= 0xfb4f) return cp === 0xfb29 ? "ES" : "R";
  if (cp >= 0xfb50 && cp <= 0xfdff)
    return cp === 0xfd3e || cp === 0xfd3f ? "ON" : "AL";
  if (cp >= 0xfe70 && cp <= 0xfefc) return "AL";
  if (cp === 0x00a0 || cp === 0x202f || cp === 0x2044) return "CS";
  if (cp === 0x00b0 || cp === 0x00b1 || (cp >= 0x2030 && cp <= 0x2034))
    return "ET";
  if (cp === 0x00b2 || cp === 0x00b3 || cp === 0x00b9) return "EN";
  if (cp === 0x2070 || (cp >= 0x2074 && cp <= 0x2079)) return "EN";
  if (cp >= 0x2080 && cp <= 0x2089) return "EN";
  if (cp >= 0xff10 && cp <= 0xff19) return "EN";
  if (cp === 0x2212 || cp === 0x207a || cp === 0x207b) return "ES";
  if (CURRENCY.test(ch)) return "ET";
  if (SPACE_SEPARATOR.test(ch) || cp === 0x2028 || cp === 0x2029) return "WS";
  if (FORMAT_CONTROL.test(ch)) return "BN";
  if (LETTER.test(ch)) return "L";
  // Anything else with a letter's case reads left to right.
  return ch.toLowerCase() !== ch.toUpperCase() ? "L" : "ON";
}

/** The code-unit offset of each of `chars`, the code points of one string in order. */
export function codeUnitOffsets(chars: readonly string[]): number[] {
  const offsets: number[] = [];
  let offset = 0;
  for (const ch of chars) {
    offsets.push(offset);
    offset += ch.length;
  }
  return offsets;
}

/** True when `text` holds any right-to-left character. */
export function hasRtl(text: string): boolean {
  return RTL.test(text);
}

/**
 * `text` with each run of combining marks moved back after the right-to-left
 * letter it sits on. A PDF draws a letter and then its marks; a reader reversing
 * that visual order code point by code point puts the marks first (UAX #9 L3).
 */
export function marksAfterLetters(text: string): string {
  if (!hasRtl(text)) return text;
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    if (!COMBINING_MARK.test(chars[i])) continue;
    let end = i;
    while (end < chars.length && COMBINING_MARK.test(chars[end])) end++;
    if (
      end < chars.length &&
      RTL.test(chars[end]) &&
      !COMBINING_MARK.test(chars[end])
    )
      chars.splice(i, end - i + 1, ...chars.slice(i, end + 1).reverse());
    i = end;
  }
  return chars.join("");
}

/** True when `text` has more right-to-left letters than left-to-right ones. */
export function isMostlyRtl(text: string): boolean {
  let balance = 0;
  for (const ch of text) {
    const cls = classOf(ch);
    if (cls === "R" || cls === "AL") balance++;
    else if (cls === "L") balance--;
  }
  return balance > 0;
}

/** True when the first strong character of `text` is right-to-left (UAX #9 P2). */
export function isRtlBase(text: string): boolean {
  for (const ch of text) {
    const cls = classOf(ch);
    if (cls === "R" || cls === "AL") return true;
    if (cls === "L") return false;
  }
  return false;
}

type Strong = "L" | "R";

function nearestStrong(
  classes: readonly BidiClass[],
  from: number,
  step: 1 | -1,
): Strong | null {
  for (let i = from + step; i >= 0 && i < classes.length; i += step) {
    const strong = strongOf(classes[i]);
    if (strong !== null) return strong;
  }
  return null;
}

function strongOf(cls: BidiClass): Strong | null {
  if (cls === "L") return "L";
  return cls === "R" || cls === "EN" || cls === "AN" ? "R" : null;
}

// W1 to W7: marks take their letter's class, numbers and their separators settle, and what is left over turns neutral.
function resolveWeak(classes: BidiClass[], sos: Strong): void {
  let before: BidiClass = sos;
  for (let i = 0; i < classes.length; i++) {
    if (classes[i] === "NSM" || classes[i] === "BN") classes[i] = before;
    before = classes[i];
  }
  let strong: BidiClass = sos;
  for (let i = 0; i < classes.length; i++) {
    const cls = classes[i];
    if (cls === "EN" && strong === "AL") classes[i] = "AN";
    else if (cls === "L" || cls === "R" || cls === "AL") strong = cls;
  }
  for (let i = 0; i < classes.length; i++)
    if (classes[i] === "AL") classes[i] = "R";
  for (let i = 1; i < classes.length - 1; i++) {
    const prev = classes[i - 1];
    if (prev !== classes[i + 1]) continue;
    if (classes[i] === "ES" && prev === "EN") classes[i] = "EN";
    else if (classes[i] === "CS" && (prev === "EN" || prev === "AN"))
      classes[i] = prev;
  }
  for (let i = 0; i < classes.length; i++) {
    if (classes[i] !== "ET") continue;
    let end = i;
    while (end < classes.length && classes[end] === "ET") end++;
    const joined =
      (i > 0 && classes[i - 1] === "EN") ||
      (end < classes.length && classes[end] === "EN");
    for (let j = i; j < end; j++) classes[j] = joined ? "EN" : "ON";
    i = end - 1;
  }
  strong = sos;
  for (let i = 0; i < classes.length; i++) {
    const cls = classes[i];
    if (cls === "ES" || cls === "CS") classes[i] = "ON";
    else if (cls === "EN" && strong === "L") classes[i] = "L";
    else if (cls === "L" || cls === "R") strong = cls;
  }
}

// N0: a bracket pair takes the direction of the text it encloses, or of the text before it when it encloses only the opposite direction. Drawn order puts that text on either side, so `drawn` looks after the pair too.
function resolveBrackets(
  chars: readonly string[],
  classes: BidiClass[],
  embedding: Strong,
  drawn: boolean,
): void {
  const open: number[] = [];
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < chars.length; i++) {
    if (classes[i] !== "ON") continue;
    if (OPENING_BRACKET[chars[i]]) {
      if (open.length === MAX_OPEN_BRACKETS) break;
      open.push(i);
      continue;
    }
    const opener = CLOSING_BRACKET[chars[i]];
    if (!opener) continue;
    for (let k = open.length - 1; k >= 0; k--) {
      if (chars[open[k]] !== opener) continue;
      pairs.push([open[k], i]);
      open.length = k;
      break;
    }
  }
  pairs.sort((a, b) => a[0] - b[0]);
  const opposite: Strong = embedding === "L" ? "R" : "L";
  for (const [from, to] of pairs) {
    let inside: Strong | null = null;
    for (let i = from + 1; i < to && inside !== embedding; i++)
      inside = strongOf(classes[i]) ?? inside;
    if (inside === null) continue;
    let direction = embedding;
    if (inside !== embedding) {
      const before = nearestStrong(classes, from, -1) ?? embedding;
      const after = drawn ? nearestStrong(classes, to, 1) : null;
      if (before === opposite || after === opposite) direction = opposite;
    }
    classes[from] = direction;
    classes[to] = direction;
  }
}

// N1, N2: a run of neutrals takes the direction both its sides share, else the embedding direction.
function resolveNeutrals(classes: BidiClass[], embedding: Strong): void {
  for (let i = 0; i < classes.length; i++) {
    if (classes[i] !== "ON" && classes[i] !== "WS") continue;
    let end = i;
    while (
      end < classes.length &&
      (classes[end] === "ON" || classes[end] === "WS")
    )
      end++;
    const before = i > 0 ? strongOf(classes[i - 1]) : embedding;
    const after = end < classes.length ? strongOf(classes[end]) : embedding;
    const resolved = before === after && before !== null ? before : embedding;
    for (let j = i; j < end; j++) classes[j] = resolved;
    i = end - 1;
  }
}

function resolveLevels(
  chars: readonly string[],
  base: number,
  drawn = false,
): number[] {
  const original = chars.map(classOf);
  const classes = [...original];
  const embedding: Strong = base % 2 === 1 ? "R" : "L";
  resolveWeak(classes, embedding);
  resolveBrackets(chars, classes, embedding, drawn);
  resolveNeutrals(classes, embedding);
  // I1, I2.
  const levels = classes.map((cls) => {
    if (base % 2 === 0)
      return cls === "R" ? base + 1 : cls === "L" ? base : base + 2;
    return cls === "R" ? base : base + 1;
  });
  // L1: white space ending the line sits at the paragraph level.
  for (let i = chars.length - 1; i >= 0; i--) {
    if (original[i] !== "WS" && original[i] !== "BN") break;
    levels[i] = base;
  }
  return levels;
}

// L2: from the highest level down to the lowest odd one, reverse every run at that level or above.
function reorderByLevel(levels: readonly number[]): number[] {
  const order = levels.map((_, i) => i);
  const highest = Math.max(0, ...levels);
  const lowestOdd = Math.min(
    ...levels.filter((level) => level % 2 === 1),
    highest + 1,
  );
  for (let level = highest; level >= lowestOdd; level--) {
    for (let i = 0; i < order.length; i++) {
      if (levels[order[i]] < level) continue;
      let end = i;
      while (end < order.length && levels[order[end]] >= level) end++;
      order.splice(i, end - i, ...order.slice(i, end).reverse());
      i = end - 1;
    }
  }
  return order;
}

/**
 * `text` in the order its characters are drawn left to right, and for each drawn
 * position the index of the character in `text` it shows and whether it sits in
 * a right-to-left run.
 */
export function visualOrder(
  text: string,
  rtlBase = isRtlBase(text),
): { visual: string; order: number[]; rightToLeft: boolean[] } {
  const chars = [...text];
  const offsets = codeUnitOffsets(chars);
  const levels = resolveLevels(chars, rtlBase ? 1 : 0);
  const order = reorderByLevel(levels);
  // L3: reversal left each right-to-left letter's marks ahead of it; a PDF draws the letter first.
  for (let i = 0; i < order.length; i++) {
    if (levels[order[i]] % 2 === 0 || !COMBINING_MARK.test(chars[order[i]]))
      continue;
    let end = i;
    while (end < order.length && COMBINING_MARK.test(chars[order[end]])) end++;
    if (end < order.length && order[end] < order[i])
      order.splice(i, end - i + 1, ...order.slice(i, end + 1).reverse());
    i = end;
  }
  const visual = order
    .map((i) =>
      levels[i] % 2 === 1 ? (MIRRORED[chars[i]] ?? chars[i]) : chars[i],
    )
    .join("");
  const units = order.flatMap((i) => (chars[i].length === 2 ? [i, i] : [i]));
  return {
    visual,
    order: order.flatMap((i) =>
      chars[i].length === 2 ? [offsets[i], offsets[i] + 1] : [offsets[i]],
    ),
    rightToLeft: units.map((i) => levels[i] % 2 === 1),
  };
}

function leadingLetter(piece: string): string {
  for (const ch of piece) if (!COMBINING_MARK.test(ch)) return ch;
  return piece;
}

function readFromBase(
  drawn: readonly string[],
  rtlBase: boolean,
  bracketsJoinEitherSide: boolean,
): { order: number[]; texts: string[]; faithful: boolean } {
  const levels = resolveLevels(
    drawn.map(leadingLetter),
    rtlBase ? 1 : 0,
    bracketsJoinEitherSide,
  );
  const order = reorderByLevel(levels);
  const texts = order.map((piece) =>
    levels[piece] % 2 === 1
      ? (MIRRORED[drawn[piece]] ?? drawn[piece])
      : drawn[piece],
  );
  const text = texts.join("");
  const pieceAt = order.flatMap((piece, k) =>
    Array.from({ length: texts[k].length }, () => piece),
  );
  const redrawn = visualOrder(text, rtlBase);
  let faithful = isRtlBase(text) === rtlBase;
  let expected = 0;
  let last = -1;
  redrawn.order.forEach((source, position) => {
    const piece = pieceAt[source];
    if (piece === last) return;
    if (piece !== expected) faithful = false;
    if (drawn[piece].length === 1 && redrawn.visual[position] !== drawn[piece])
      faithful = false;
    last = piece;
    expected++;
  });
  return { order, texts, faithful: faithful && expected === drawn.length };
}

/**
 * The reading order of a line given as the pieces drawn on it from left to
 * right: `order` lists the pieces as they are read and `texts` holds what each
 * says there, a mirrored bracket turned back. A piece is a letter with its
 * marks, a ligature or a space, already in reading order inside.
 *
 * `faithful` is false when laying the result out again with
 * {@link visualOrder} would not put every piece back where it was drawn; the
 * order is then a best guess and the line must not be redrawn from it.
 */
export function readingOrder(drawn: readonly string[]): {
  order: number[];
  texts: string[];
  faithful: boolean;
} {
  const rtlFirst = isMostlyRtl(drawn.join(""));
  // Several reading orders can draw the same line; the one that keeps a bracketed aside with the phrase beside it is tried first.
  const attempts = [
    [rtlFirst, true],
    [rtlFirst, false],
    [!rtlFirst, true],
    [!rtlFirst, false],
  ] as const;
  const [first, ...rest] = attempts;
  const guess = readFromBase(drawn, ...first);
  if (guess.faithful) return guess;
  for (const [rtlBase, eitherSide] of rest) {
    const read = readFromBase(drawn, rtlBase, eitherSide);
    if (read.faithful) return read;
  }
  return guess;
}
