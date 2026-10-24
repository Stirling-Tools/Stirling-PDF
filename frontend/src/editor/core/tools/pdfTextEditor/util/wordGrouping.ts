/** A positioned piece of a text run: one PDF text object, often one glyph. */
export interface WordLeaf {
  text: string;
  x: number;
  right: number;
  baseline: number;
}

export interface Word<L extends WordLeaf> {
  glyphs: L[];
  x: number;
  right: number;
  baseline: number;
}

const SAME_LINE_PT = 2;
/** Gap that separates words when nothing better is known, in em. */
const WORD_GAP_EM = 0.18;
/** How far past a line's own letter-spacing a gap must reach to be a space, in em. */
const SPACE_OVER_TRACKING_EM = 0.15;

/**
 * Group reading-ordered leaves into the words a reflow may break between.
 *
 * Whitespace in the text decides first. A raw x-gap cannot tell a word space
 * from letter-spacing: a tracked heading drawn one glyph per object has glyph
 * gaps wider than any fixed threshold, so every glyph became its own word and
 * the line breaker split "Open Source" into one character per line. Between
 * single-glyph leaves the gap is therefore judged against that line's own
 * median glyph gap.
 *
 * A whitespace-only leaf stays on the word before it, so a word can end in a
 * space; `endsWithSpace` reports that.
 */
export function groupWords<L extends WordLeaf>(
  leaves: L[],
  fontSize: number,
): Word<L>[] {
  const lineOf = lineIndices(leaves);
  const trackingByLine = medianGlyphGapByLine(leaves, lineOf);
  const words: Word<L>[] = [];
  let cur: L[] = [];
  const flush = () => {
    if (cur.length === 0) return;
    words.push({
      glyphs: cur,
      x: Math.min(...cur.map((g) => g.x)),
      right: Math.max(...cur.map((g) => g.right)),
      baseline: cur[0].baseline,
    });
    cur = [];
  };
  for (let i = 0; i < leaves.length; i++) {
    const g = leaves[i];
    const prev = leaves[i - 1];
    const tracking = trackingByLine.get(lineOf[i]);
    if (prev && startsNewWord(prev, g, fontSize, tracking)) flush();
    cur.push(g);
  }
  flush();
  return words;
}

export function endsWithSpace<L extends WordLeaf>(word: Word<L>): boolean {
  const last = word.glyphs[word.glyphs.length - 1];
  return last !== undefined && /\s$/.test(last.text);
}

function startsNewWord(
  prev: WordLeaf,
  g: WordLeaf,
  fontSize: number,
  tracking: number | undefined,
): boolean {
  if (!sameLine(prev, g)) return true;
  if (isBlank(g)) return false;
  if (/\s$/.test(prev.text) || /^\s/.test(g.text)) return true;
  const gap = g.x - prev.right;
  const threshold =
    isSingleGlyph(prev) && isSingleGlyph(g) && tracking !== undefined
      ? Math.max(
          fontSize * WORD_GAP_EM,
          tracking + fontSize * SPACE_OVER_TRACKING_EM,
        )
      : fontSize * WORD_GAP_EM;
  return gap > threshold;
}

/** Line number of each leaf; leaves arrive in reading order. */
function lineIndices(leaves: WordLeaf[]): number[] {
  const out: number[] = [];
  let line = 0;
  for (let i = 0; i < leaves.length; i++) {
    if (i > 0 && !sameLine(leaves[i - 1], leaves[i])) line += 1;
    out.push(line);
  }
  return out;
}

function medianGlyphGapByLine(
  leaves: WordLeaf[],
  lineOf: number[],
): Map<number, number> {
  const gapsByLine = new Map<number, number[]>();
  for (let i = 1; i < leaves.length; i++) {
    const a = leaves[i - 1];
    const b = leaves[i];
    if (lineOf[i - 1] !== lineOf[i]) continue;
    if (!isSingleGlyph(a) || !isSingleGlyph(b)) continue;
    const gaps = gapsByLine.get(lineOf[i]) ?? [];
    gaps.push(b.x - a.right);
    gapsByLine.set(lineOf[i], gaps);
  }
  const medians = new Map<number, number>();
  for (const [line, gaps] of gapsByLine) {
    gaps.sort((x, y) => x - y);
    // Lower median: with few samples the larger gaps are likely word spaces,
    // and an upper median would raise the threshold above them.
    medians.set(line, gaps[Math.floor((gaps.length - 1) / 2)]);
  }
  return medians;
}

function sameLine(a: WordLeaf, b: WordLeaf): boolean {
  return Math.abs(a.baseline - b.baseline) <= SAME_LINE_PT;
}

function isBlank(leaf: WordLeaf): boolean {
  return leaf.text.trim() === "";
}

function isSingleGlyph(leaf: WordLeaf): boolean {
  return [...leaf.text.trim()].length === 1;
}
