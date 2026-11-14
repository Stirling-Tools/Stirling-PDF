/**
 * Contextual Arabic letter forms from the Unicode presentation-form blocks.
 * A PDF text object draws each character's own glyph, with no shaping engine
 * between the text and the page, so Arabic written as base letters draws every
 * letter in its isolated form. Fonts that map the presentation forms (Noto Sans
 * Arabic, DejaVu Sans) draw the joined forms these code points name.
 */

// Isolated, final, initial, medial; right-joining letters have only the first two.
const FORMS: Record<number, readonly number[]> = {
  0x0621: [0xfe80],
  0x0622: [0xfe81, 0xfe82],
  0x0623: [0xfe83, 0xfe84],
  0x0624: [0xfe85, 0xfe86],
  0x0625: [0xfe87, 0xfe88],
  0x0626: [0xfe89, 0xfe8a, 0xfe8b, 0xfe8c],
  0x0627: [0xfe8d, 0xfe8e],
  0x0628: [0xfe8f, 0xfe90, 0xfe91, 0xfe92],
  0x0629: [0xfe93, 0xfe94],
  0x062a: [0xfe95, 0xfe96, 0xfe97, 0xfe98],
  0x062b: [0xfe99, 0xfe9a, 0xfe9b, 0xfe9c],
  0x062c: [0xfe9d, 0xfe9e, 0xfe9f, 0xfea0],
  0x062d: [0xfea1, 0xfea2, 0xfea3, 0xfea4],
  0x062e: [0xfea5, 0xfea6, 0xfea7, 0xfea8],
  0x062f: [0xfea9, 0xfeaa],
  0x0630: [0xfeab, 0xfeac],
  0x0631: [0xfead, 0xfeae],
  0x0632: [0xfeaf, 0xfeb0],
  0x0633: [0xfeb1, 0xfeb2, 0xfeb3, 0xfeb4],
  0x0634: [0xfeb5, 0xfeb6, 0xfeb7, 0xfeb8],
  0x0635: [0xfeb9, 0xfeba, 0xfebb, 0xfebc],
  0x0636: [0xfebd, 0xfebe, 0xfebf, 0xfec0],
  0x0637: [0xfec1, 0xfec2, 0xfec3, 0xfec4],
  0x0638: [0xfec5, 0xfec6, 0xfec7, 0xfec8],
  0x0639: [0xfec9, 0xfeca, 0xfecb, 0xfecc],
  0x063a: [0xfecd, 0xfece, 0xfecf, 0xfed0],
  0x0641: [0xfed1, 0xfed2, 0xfed3, 0xfed4],
  0x0642: [0xfed5, 0xfed6, 0xfed7, 0xfed8],
  0x0643: [0xfed9, 0xfeda, 0xfedb, 0xfedc],
  0x0644: [0xfedd, 0xfede, 0xfedf, 0xfee0],
  0x0645: [0xfee1, 0xfee2, 0xfee3, 0xfee4],
  0x0646: [0xfee5, 0xfee6, 0xfee7, 0xfee8],
  0x0647: [0xfee9, 0xfeea, 0xfeeb, 0xfeec],
  0x0648: [0xfeed, 0xfeee],
  0x0649: [0xfeef, 0xfef0],
  0x064a: [0xfef1, 0xfef2, 0xfef3, 0xfef4],
};
// Lam followed by one of these alefs is written as a single ligature (isolated, final).
const LAM = 0x0644;
const LAM_ALEF: Record<number, readonly [number, number]> = {
  0x0622: [0xfef5, 0xfef6],
  0x0623: [0xfef7, 0xfef8],
  0x0625: [0xfef9, 0xfefa],
  0x0627: [0xfefb, 0xfefc],
};
const TATWEEL = 0x0640;
// Harakat and other marks sit on a letter without breaking its joins.
const TRANSPARENT = /[ؐ-ًؚ-ٰٟۖ-ۭ]/;

function joinsForward(cp: number | undefined): boolean {
  return cp === TATWEEL || (cp !== undefined && FORMS[cp]?.length === 4);
}

function joinsBack(cp: number | undefined): boolean {
  return cp === TATWEEL || (cp !== undefined && (FORMS[cp]?.length ?? 0) >= 2);
}

/** True when `text` holds an Arabic letter that has contextual forms. */
export function needsArabicShaping(text: string): boolean {
  for (const ch of text) if (FORMS[ch.codePointAt(0)!]) return true;
  return false;
}

/**
 * `text` with each Arabic letter in the form its neighbours call for, and for
 * each character of the result the stretch of `text` it shows, as
 * [`source`, `sourceEnd`).
 */
export function shapeArabic(text: string): {
  text: string;
  source: number[];
  sourceEnd: number[];
} {
  const units = [...text];
  const offsets: number[] = [];
  let offset = 0;
  for (const unit of units) {
    offsets.push(offset);
    offset += unit.length;
  }
  const cps = units.map((unit) => unit.codePointAt(0)!);
  const neighbour = (from: number, step: 1 | -1): number | undefined => {
    for (let i = from + step; i >= 0 && i < units.length; i += step)
      if (!TRANSPARENT.test(units[i])) return cps[i];
    return undefined;
  };
  const neighbourIndex = (from: number): number => {
    for (let i = from + 1; i < units.length; i++)
      if (!TRANSPARENT.test(units[i])) return i;
    return -1;
  };
  let out = "";
  const source: number[] = [];
  const sourceEnd: number[] = [];
  const emit = (cp: number, from: number, to = from) => {
    const ch = String.fromCodePoint(cp);
    out += ch;
    for (let k = 0; k < ch.length; k++) {
      source.push(offsets[from]);
      sourceEnd.push(offsets[to] + units[to].length);
    }
  };
  for (let i = 0; i < units.length; i++) {
    const cp = cps[i];
    const forms = FORMS[cp];
    if (!forms) {
      emit(cp, i);
      continue;
    }
    const joinedBefore = joinsForward(neighbour(i, -1));
    const next = neighbourIndex(i);
    const alef = cp === LAM && next >= 0 ? LAM_ALEF[cps[next]] : undefined;
    if (alef) {
      emit(alef[joinedBefore ? 1 : 0], i, next);
      for (let k = i + 1; k < next; k++) emit(cps[k], k);
      i = next;
      continue;
    }
    const joinedAfter = forms.length === 4 && joinsBack(neighbour(i, 1));
    const form =
      joinedBefore && joinedAfter
        ? 3
        : joinedAfter
          ? 2
          : joinedBefore && forms.length >= 2
            ? 1
            : 0;
    emit(forms[form], i);
  }
  return { text: out, source, sourceEnd };
}
