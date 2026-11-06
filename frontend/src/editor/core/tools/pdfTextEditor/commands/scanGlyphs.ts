export interface GlyphImage {
  rgba: Uint8Array;
  width: number;
  height: number;
  inkLeft: number;
  inkRight: number;
}

export interface GlyphAtlas {
  glyphs: Map<string, GlyphImage[]>;
  scale: number;
  height: number;
  descent: number;
  letterGap: number;
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

export function buildGlyphAtlas(
  words: ScannedWord[],
  descent: number,
): GlyphAtlas | null {
  const usable = words.filter(
    (w) =>
      w.spans.length > 0 &&
      w.spans.length === [...w.text].length &&
      w.height > 0,
  );
  if (usable.length === 0) return null;
  const scale = usable[0].scale;
  const height = usable[0].height;
  const glyphs = new Map<string, GlyphImage[]>();
  const gaps: number[] = [];
  for (const word of usable) {
    if (word.height !== height || Math.abs(word.scale - scale) > 1e-6) continue;
    const cols = word.spans.map((s) => ({
      l: Math.round((s.left - word.left) * word.scale),
      r: Math.round((s.right - word.left) * word.scale),
    }));
    const chars = [...word.text];
    cols.forEach((c, i) => {
      const prev = cols[i - 1];
      const next = cols[i + 1];
      if (next) gaps.push(next.l - c.r);
      const from = Math.max(0, prev ? Math.ceil((prev.r + c.l) / 2) : c.l - 3);
      const to = Math.min(
        word.width,
        next ? Math.floor((c.r + next.l) / 2) : c.r + 3,
      );
      if (to - from < 1 || c.r <= c.l) return;
      const img = cropColumns(word, from, to);
      const list = glyphs.get(chars[i]) ?? [];
      list.push({ ...img, inkLeft: c.l - from, inkRight: c.r - from });
      glyphs.set(chars[i], list);
    });
  }
  if (glyphs.size === 0) return null;
  gaps.sort((p, q) => p - q);
  return {
    glyphs,
    scale,
    height,
    descent,
    letterGap: gaps.length ? gaps[gaps.length >> 1] : Math.round(scale * 0.6),
  };
}

function sampleOf(atlas: GlyphAtlas, ch: string): GlyphImage | null {
  const list = atlas.glyphs.get(ch);
  if (!list || list.length === 0) return null;
  const sorted = [...list].sort(
    (p, q) => p.inkRight - p.inkLeft - (q.inkRight - q.inkLeft),
  );
  return sorted[sorted.length >> 1];
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
  for (const ch of text) {
    if (/\s/.test(ch)) {
      afterSpace = placed.length > 0;
      continue;
    }
    const glyph = sampleOf(atlas, ch);
    if (!glyph) return null;
    if (placed.length > 0) pen += afterSpace ? wordGap : atlas.letterGap;
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
  return {
    rgba,
    width,
    height,
    inkLeft: -minX,
    inkRight: pen - minX,
  };
}
