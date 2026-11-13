import { median } from "@editor/tools/pdfTextEditor/util/median";

export interface GlyphImage {
  rgba: Uint8Array;
  width: number;
  height: number;
  inkLeft: number;
  inkRight: number;
}

export interface GlyphAtlas {
  glyphs: Map<string, GlyphImage>;
  scale: number;
  height: number;
  descent: number;
  letterGap: number;
  pitch: number | null;
}

export interface ScannedWord {
  text: string;
  rgba: Uint8Array;
  width: number;
  height: number;
  left: number;
  scale: number;
  spans: Array<{ left: number; right: number }>;
}

function cropColumns(
  word: ScannedWord,
  from: number,
  to: number,
): Pick<GlyphImage, "rgba" | "width" | "height"> {
  const width = to - from;
  const rgba = new Uint8Array(width * word.height * 4);
  for (let y = 0; y < word.height; y++)
    rgba.set(
      word.rgba.subarray(
        (y * word.width + from) * 4,
        (y * word.width + to) * 4,
      ),
      y * width * 4,
    );
  return { rgba, width, height: word.height };
}

interface Sample {
  ch: string;
  word: ScannedWord;
  from: number;
  to: number;
  inkLeft: number;
  inkRight: number;
  top: number;
  bottom: number;
}

const INK_ALPHA = 128;
const HEIGHT_SLACK = 0.2;
const MIN_PITCH_STEPS = 7;
const PITCH_SLACK = 0.15;
const ON_PITCH = 0.85;

const TOP_CLASSES: Array<[RegExp, string]> = [
  [/^[acegmnopqrsuvwxyz]$/, "x"],
  [/^[bdfhijkl]$/, "ascender"],
  [/^[A-Z0-9]$/, "capital"],
];

const BOTTOM_CLASSES: Array<[RegExp, string]> = [
  [/^[gjpqy]$/, "descender"],
  [/^[a-zA-IK-PR-Z0-9]$/, "baseline"],
];

const classIn = (classes: Array<[RegExp, string]>, ch: string) =>
  classes.find(([chars]) => chars.test(ch))?.[1] ?? null;

const topClassOf = (ch: string) => classIn(TOP_CLASSES, ch);

const bottomClassOf = (ch: string) => classIn(BOTTOM_CLASSES, ch);

function inkRows(
  word: ScannedWord,
  left: number,
  right: number,
  baseRow: number,
): { top: number; bottom: number } | null {
  let first = -1;
  let last = -1;
  for (let y = 0; y < word.height; y++)
    for (let x = Math.max(0, left); x < Math.min(word.width, right); x++)
      if (word.rgba[(y * word.width + x) * 4 + 3] >= INK_ALPHA) {
        if (first < 0) first = y;
        last = y;
        break;
      }
  return first < 0
    ? null
    : { top: baseRow - first, bottom: baseRow - last - 1 };
}

function atTheirHeight(samples: Sample[]): Sample[] {
  const tops = samples.filter((s) => topClassOf(s.ch)).map((s) => s.top);
  if (tops.length === 0) return samples;
  const slack = median(tops) * HEIGHT_SLACK;
  const typical = (
    classOf: (ch: string) => string | null,
    edge: (s: Sample) => number,
  ) => {
    const groups = new Map<string, number[]>();
    for (const s of samples) {
      const key = classOf(s.ch);
      if (key) groups.set(key, [...(groups.get(key) ?? []), edge(s)]);
    }
    return (s: Sample) => {
      const key = classOf(s.ch);
      const group = key ? groups.get(key) : undefined;
      return !group || Math.abs(edge(s) - median(group)) <= slack;
    };
  };
  const topFits = typical(topClassOf, (s) => s.top);
  const bottomFits = typical(bottomClassOf, (s) => s.bottom);
  return samples.filter((s) => topFits(s) && bottomFits(s));
}

function evenPitch(steps: number[]): number | null {
  if (steps.length < MIN_PITCH_STEPS) return null;
  const pitch = median(steps);
  if (pitch <= 0) return null;
  const onPitch = steps.filter((st) => Math.abs(st / pitch - 1) < PITCH_SLACK);
  return onPitch.length >= steps.length * ON_PITCH ? pitch : null;
}

// Spans run left to right in ink order, so a word holding right-to-left letters would pair letters with the wrong ink.
const RIGHT_TO_LEFT =
  /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u;

export function buildGlyphAtlas(
  words: ScannedWord[],
  descent: number,
): GlyphAtlas | null {
  const usable = words.filter(
    (w) =>
      w.spans.length > 0 &&
      w.spans.length === [...w.text].length &&
      w.height > 0 &&
      !RIGHT_TO_LEFT.test(w.text),
  );
  if (usable.length === 0) return null;
  const scale = usable[0].scale;
  const height = usable[0].height;
  const baseRow = height - descent * scale;
  const samples: Sample[] = [];
  const gaps: number[] = [];
  const steps: number[] = [];
  for (const word of usable) {
    if (word.height !== height || Math.abs(word.scale - scale) > 1e-6) continue;
    const cols = word.spans.map((s) => ({
      l: Math.round((s.left - word.left) * word.scale),
      r: Math.round((s.right - word.left) * word.scale),
    }));
    const chars = [...word.text];
    const digitsOnly = /^\d+$/.test(word.text);
    cols.forEach((c, i) => {
      const prev = cols[i - 1];
      const next = cols[i + 1];
      if (next) {
        gaps.push(next.l - c.r);
        if (!digitsOnly) steps.push((next.l + next.r - c.l - c.r) / 2);
      }
      const from = Math.max(0, prev ? Math.ceil((prev.r + c.l) / 2) : c.l - 3);
      const to = Math.min(
        word.width,
        next ? Math.floor((c.r + next.l) / 2) : c.r + 3,
      );
      if (to - from < 1 || c.r <= c.l) return;
      const rows = inkRows(word, c.l, c.r, baseRow);
      if (!rows) return;
      samples.push({
        ch: chars[i],
        word,
        from,
        to,
        inkLeft: c.l - from,
        inkRight: c.r - from,
        ...rows,
      });
    });
  }
  const byChar = new Map<string, Sample[]>();
  for (const s of atTheirHeight(samples))
    byChar.set(s.ch, [...(byChar.get(s.ch) ?? []), s]);
  if (byChar.size === 0) return null;
  const glyphs = new Map<string, GlyphImage>();
  for (const [ch, list] of byChar) {
    list.sort((p, q) => p.inkRight - p.inkLeft - (q.inkRight - q.inkLeft));
    const s = list[list.length >> 1];
    glyphs.set(ch, {
      ...cropColumns(s.word, s.from, s.to),
      inkLeft: s.inkLeft,
      inkRight: s.inkRight,
    });
  }
  gaps.sort((p, q) => p - q);
  return {
    glyphs,
    scale,
    height,
    descent,
    letterGap: gaps.length ? gaps[gaps.length >> 1] : Math.round(scale * 0.6),
    pitch: evenPitch(steps),
  };
}

export interface ComposedText {
  rgba: Uint8Array;
  width: number;
  height: number;
  inkLeft: number;
  inkRight: number;
}

export function composeText(
  atlas: GlyphAtlas,
  text: string,
  wordGap: number,
): ComposedText | null {
  const placed: Array<{ glyph: GlyphImage; x: number }> = [];
  let pen = 0;
  let afterSpace = false;
  for (const [i, ch] of [...text].entries()) {
    if (/\s/.test(ch)) {
      afterSpace = placed.length > 0;
      continue;
    }
    const glyph = atlas.glyphs.get(ch);
    if (!glyph) return null;
    if (atlas.pitch !== null) {
      const centre = (glyph.inkLeft + glyph.inkRight) / 2;
      placed.push({ glyph, x: Math.round(i * atlas.pitch - centre) });
      continue;
    }
    // Whole pixels only: a fractional pen makes the width fractional and shifts every row in the buffer.
    if (placed.length > 0)
      pen += afterSpace ? Math.round(wordGap) : atlas.letterGap;
    afterSpace = false;
    placed.push({ glyph, x: pen - glyph.inkLeft });
    pen += glyph.inkRight - glyph.inkLeft;
  }
  if (placed.length === 0) return null;
  const minX = Math.min(...placed.map((p) => p.x));
  const maxX = Math.max(...placed.map((p) => p.x + p.glyph.width));
  const width = maxX - minX;
  const height = atlas.height;
  const rgba = new Uint8Array(width * height * 4);
  for (const { glyph, x } of placed) {
    const ox = x - minX;
    for (let y = 0; y < height; y++)
      for (let gx = 0; gx < glyph.width; gx++) {
        const src = (y * glyph.width + gx) * 4;
        const dst = (y * width + ox + gx) * 4;
        if (glyph.rgba[src + 3] <= rgba[dst + 3]) continue;
        rgba.set(glyph.rgba.subarray(src, src + 4), dst);
      }
  }
  const first = placed[0];
  const last = placed[placed.length - 1];
  return {
    rgba,
    width,
    height,
    inkLeft: first.x + first.glyph.inkLeft - minX,
    inkRight: last.x + last.glyph.inkRight - minX,
  };
}
