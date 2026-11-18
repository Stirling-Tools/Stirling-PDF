// Reads the family, weight and slant out of a font name as PDFs and font
// sources spell it: "ABCDEF+Calibri-Bold", "Arial,BoldItalic", "Segoe UI
// Semibold", "TimesNewRomanPS-BoldItalicMT", "Georgia-Bold-Italic".

export const REGULAR_WEIGHT = 400;
export const BOLD_WEIGHT = 700;

/** Semibold and heavier read as bold, as CSS `bolder` and the font sources' own bold flags do. */
export function isBoldWeight(weight: number): boolean {
  return weight >= 600;
}

export interface FaceStyle {
  weight: number;
  italic: boolean;
}

export interface ParsedFaceName extends FaceStyle {
  family: string;
  /** Whether the name says its weight, "Regular" included; false leaves the weight to other sources. */
  weightStated: boolean;
}

const WEIGHT_WORDS: Record<string, number> = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  ligh: 300,
  semilight: 350,
  book: 400,
  regular: 400,
  regu: 400,
  normal: 400,
  roman: 400,
  medium: 500,
  // URW's abbreviation in its base-35 clones (NimbusRomNo9L-Medi stands in for
  // Times-Bold); the full word "Medium" stays a true 500.
  medi: BOLD_WEIGHT,
  semibold: 600,
  demibold: 600,
  demi: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  heavy: 800,
  black: 900,
  extrablack: 950,
  ultrablack: 950,
};

const ITALIC_WORDS = ["italic", "oblique", "slanted", "ital", "slant", "it"];
/** PostScript names end in these vendor marks ("Arial-BoldMT", "TimesNewRomanPSMT"). */
const VENDOR_MARKS = ["psmt", "mt", "ps"];
const MODIFIERS = new Set(["extra", "ultra", "semi", "demi"]);

const STYLE_WORDS = [
  ...Object.keys(WEIGHT_WORDS),
  ...ITALIC_WORDS,
  ...VENDOR_MARKS,
].sort((a, b) => b.length - a.length);

const CAMEL_STYLE_SUFFIX =
  /^(.*?[a-z0-9]{2})((?:Thin|ExtraLight|UltraLight|Light|Medium|SemiBold|Semibold|DemiBold|Demibold|ExtraBold|Bold|Black|Heavy|Italic|Oblique)+)$/;

interface TokenStyle {
  weight: number | null;
  italic: boolean;
}

/** The style a token spells out entirely, or null when any of it is not a style word. */
function readStyleToken(token: string): TokenStyle | null {
  const lower = token.toLowerCase();
  const variable = /^wght([0-9a-f]+)$/.exec(lower);
  if (variable) {
    const weight = Math.round(parseInt(variable[1], 16) / 65536);
    return weight > 0 && weight <= 1000 ? { weight, italic: false } : null;
  }
  const numbered = /^w([1-9])$/.exec(lower);
  if (numbered) return { weight: Number(numbered[1]) * 100, italic: false };
  let at = 0;
  let weight: number | null = null;
  let italic = false;
  let words = 0;
  while (at < lower.length) {
    const word = STYLE_WORDS.find((w) => lower.startsWith(w, at));
    if (!word) return null;
    if (word in WEIGHT_WORDS) weight = WEIGHT_WORDS[word];
    else if (ITALIC_WORDS.includes(word)) italic = true;
    else if (at + word.length !== lower.length) return null;
    at += word.length;
    words++;
  }
  return words > 0 ? { weight, italic } : null;
}

function tokensOf(name: string): string[] {
  const tokens = name
    .replace(/^[A-Z]{6}\+/, "")
    .split(/[\s,_-]+/)
    .filter(Boolean);
  const merged: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const next = tokens[i + 1];
    if (
      MODIFIERS.has(tokens[i].toLowerCase()) &&
      next &&
      readStyleToken(tokens[i] + next)
    ) {
      merged.push(tokens[i] + next);
      i++;
    } else {
      merged.push(tokens[i]);
    }
  }
  return merged;
}

function isStyleAt(tokens: string[], index: number): boolean {
  // "Times New Roman" is a family, not Times New in its roman cut.
  if (
    tokens[index].toLowerCase() === "roman" &&
    tokens[index - 1]?.toLowerCase() === "new"
  )
    return false;
  return readStyleToken(tokens[index]) !== null;
}

function withoutVendorMark(token: string): string {
  return token.replace(/(?<=[a-z])(PSMT|MT|PS)$/, "");
}

/** The family a font name belongs to and the weight and slant it names. */
export function parseFaceName(name: string): ParsedFaceName {
  const tokens = tokensOf(name.trim());
  if (tokens.length === 0)
    return {
      family: name.trim(),
      weight: REGULAR_WEIGHT,
      italic: false,
      weightStated: false,
    };
  let split = tokens.findIndex((_, i) => i > 0 && isStyleAt(tokens, i));
  if (split < 0) {
    const last = tokens[tokens.length - 1];
    const camel = CAMEL_STYLE_SUFFIX.exec(withoutVendorMark(last));
    if (camel) {
      tokens.splice(tokens.length - 1, 1, camel[1], camel[2]);
      split = tokens.length - 1;
    } else {
      split = tokens.length;
    }
  }
  const familyTokens = tokens.slice(0, split);
  familyTokens[familyTokens.length - 1] = withoutVendorMark(
    familyTokens[familyTokens.length - 1],
  );
  let weight: number | null = null;
  let variableWeight: number | null = null;
  let italic = false;
  for (const token of tokens.slice(split)) {
    const style = readStyleToken(token);
    if (!style) continue;
    if (/^wght/i.test(token)) variableWeight = style.weight;
    else if (style.weight !== null) weight = style.weight;
    italic ||= style.italic;
  }
  const stated = variableWeight ?? weight;
  return {
    family: familyTokens.join(" "),
    weight: stated ?? REGULAR_WEIGHT,
    italic,
    weightStated: stated !== null,
  };
}

/** Spelling- and spacing-blind key, so "Trebuchet MS", "TrebuchetMS" and "Trebuchet-MS" are one family. */
export function familyKey(family: string): string {
  return family.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}
