import bidiFactory from "bidi-js";

const bidi = bidiFactory();

export type TextDirectionKind = "ltr" | "rtl" | "mixed";

export interface VisualGlyph {
  /** UTF-16 offset of the logical character in the source string. */
  logicalStart: number;
  /** Logical character, kept for model and selection mapping. */
  logicalText: string;
  /** Character to draw, including UAX #9 bracket mirroring. */
  renderedText: string;
  level: number;
}

export interface TextDirectionInfo {
  kind: TextDirectionKind;
  baseDirection: "ltr" | "rtl";
  visualGlyphs: VisualGlyph[];
}

interface LogicalCharacter {
  text: string;
  start: number;
}

function logicalCharacters(text: string): LogicalCharacter[] {
  const out: LogicalCharacter[] = [];
  let start = 0;
  for (const character of text) {
    out.push({ text: character, start });
    start += character.length;
  }
  return out;
}

/**
 * Replaces astral characters with one neutral placeholder before calling the
 * runtime because bidi-js indexes UTF-16 strings while its reorder helper
 * returns character indices. BMP text therefore keeps exact indices and an
 * astral character cannot be split into surrogate glyphs.
 */
function bidiInput(chars: LogicalCharacter[]): string {
  return chars
    .map(({ text }) => (text.length === 1 ? text : "\uFFFD"))
    .join("");
}

export function analyzeTextDirection(text: string): TextDirectionInfo {
  const chars = logicalCharacters(text);
  if (chars.length === 0) {
    return { kind: "ltr", baseDirection: "ltr", visualGlyphs: [] };
  }

  const input = bidiInput(chars);
  const embedding = bidi.getEmbeddingLevels(input);
  const levels = embedding.levels;
  let hasRtlStrong = false;
  let hasLtrStrong = false;
  let hasLtrDirectional = false;
  for (let i = 0; i < input.length; i += 1) {
    const type = bidi.getBidiCharTypeName(input[i]);
    if (type === "R" || type === "AL") hasRtlStrong = true;
    if (type === "L") hasLtrStrong = true;
    if (type === "EN" || type === "AN") hasLtrDirectional = true;
  }

  const baseDirection =
    (embedding.paragraphs[0]?.level ?? 0) % 2 === 1 ? "rtl" : "ltr";
  const kind: TextDirectionKind = hasRtlStrong
    ? hasLtrStrong || hasLtrDirectional
      ? "mixed"
      : "rtl"
    : "ltr";
  const order = bidi.getReorderedIndices(input, embedding);
  const mirrored = bidi.getMirroredCharactersMap(input, levels);
  const visualGlyphs = order.map((index) => ({
    logicalStart: chars[index]?.start ?? 0,
    logicalText: chars[index]?.text ?? "",
    renderedText: mirrored.get(index) ?? chars[index]?.text ?? "",
    level: levels[index] ?? 0,
  }));

  return { kind, baseDirection, visualGlyphs };
}

export function isSimpleLtrText(text: string): boolean {
  return analyzeTextDirection(text).kind === "ltr";
}

export function baseDirectionForText(text: string): "ltr" | "rtl" {
  return analyzeTextDirection(text).baseDirection;
}

/**
 * Return logical character ordinals for a visual sequence of one-code-point
 * PDF text objects. The caller uses this only after it has established that
 * each object is an independent glyph emitted by this editor; applying UAX #9
 * to an arbitrary already-logical string would be lossy.
 */
export function logicalOrderFromVisualText(text: string): number[] {
  const chars = logicalCharacters(text);
  if (chars.length === 0) return [];
  const input = bidiInput(chars);
  const embedding = bidi.getEmbeddingLevels(input);
  return bidi.getReorderedIndices(input, embedding);
}

/** Recover the logical string carried by an emitted visual glyph sequence. */
export function restoreLogicalTextFromVisualOrder(text: string): string {
  const chars = logicalCharacters(text);
  return logicalOrderFromVisualText(text)
    .map((index) => chars[index]?.text ?? "")
    .join("");
}
