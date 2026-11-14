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

const RTL = /[֐-׿؀-ۿ܀-ࣿיִ-﷿ﹰ-﻿]/;
const ARABIC_NUMBER = /[٠-٩۰-۹]/;
const EUROPEAN_NUMBER = /[0-9]/;
const NUMBER_JOINER = /[.,:/ ]/;
const LTR = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;
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
};

type Kind = "L" | "R" | "EN" | "AN" | "N";

function kindOf(ch: string): Kind {
  if (ARABIC_NUMBER.test(ch)) return "AN";
  if (EUROPEAN_NUMBER.test(ch)) return "EN";
  if (RTL.test(ch)) return "R";
  if (LTR.test(ch)) return "L";
  // Anything else with a letter's case or script reads left to right.
  return ch.toLowerCase() !== ch.toUpperCase() ? "L" : "N";
}

/** True when `text` holds any right-to-left character. */
export function hasRtl(text: string): boolean {
  return RTL.test(text);
}

/** True when `text` has more right-to-left letters than left-to-right ones. */
export function isMostlyRtl(text: string): boolean {
  let balance = 0;
  for (const ch of text) {
    const kind = kindOf(ch);
    if (kind === "R") balance++;
    else if (kind === "L") balance--;
  }
  return balance > 0;
}

/** True when the first strong character of `text` is right-to-left (UAX #9 P2). */
export function isRtlBase(text: string): boolean {
  for (const ch of text) {
    const kind = kindOf(ch);
    if (kind === "R") return true;
    if (kind === "L") return false;
  }
  return false;
}

function resolveLevels(chars: string[], base: number): number[] {
  const kinds = chars.map(kindOf);
  // Numbers joined by a single separator read as one number (W4).
  for (let i = 1; i < kinds.length - 1; i++)
    if (
      kinds[i] === "N" &&
      NUMBER_JOINER.test(chars[i]) &&
      kinds[i - 1] === kinds[i + 1] &&
      (kinds[i - 1] === "EN" || kinds[i - 1] === "AN")
    )
      kinds[i] = kinds[i - 1];
  // A neutral takes the direction of strong text on both sides, else the base (N1, N2).
  const strongSide = (k: Kind) => (k === "L" ? "L" : k === "N" ? null : "R");
  for (let i = 0; i < kinds.length; i++) {
    if (kinds[i] !== "N") continue;
    let end = i;
    while (end < kinds.length && kinds[end] === "N") end++;
    const before = i > 0 ? strongSide(kinds[i - 1]) : base ? "R" : "L";
    const after =
      end < kinds.length ? strongSide(kinds[end]) : base ? "R" : "L";
    const resolved: Kind =
      before === after && before !== null ? before : base ? "R" : "L";
    for (let j = i; j < end; j++) kinds[j] = resolved;
    i = end - 1;
  }
  // I1, I2.
  return kinds.map((kind) => {
    if (base % 2 === 0)
      return kind === "R" ? base + 1 : kind === "L" ? base : base + 2;
    return kind === "R" ? base : base + 1;
  });
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
  const offsets: number[] = [];
  let offset = 0;
  for (const ch of chars) {
    offsets.push(offset);
    offset += ch.length;
  }
  const levels = resolveLevels(chars, rtlBase ? 1 : 0);
  const order = chars.map((_, i) => i);
  const highest = Math.max(0, ...levels);
  const lowestOdd = Math.min(
    ...levels.filter((level) => level % 2 === 1),
    highest + 1,
  );
  // L2: from the highest level down, reverse every run at that level or above.
  for (let level = highest; level >= lowestOdd; level--) {
    for (let i = 0; i < order.length; i++) {
      if (levels[order[i]] < level) continue;
      let end = i;
      while (end < order.length && levels[order[end]] >= level) end++;
      order.splice(i, end - i, ...order.slice(i, end).reverse());
      i = end - 1;
    }
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
