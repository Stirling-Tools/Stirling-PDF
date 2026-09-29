// Turn captured pen positions into word boxes the overlay tiles at the engine's
// own origins, instead of re-flowing the line with a substitute font's advances.

export interface ExactToken {
  text: string;
  /** Advance width in PDF points. */
  width: number;
  /** True for a run of spaces rather than a word. */
  space: boolean;
}

export interface ExactLine {
  /** Pen X of the line's first character, in PDF points. */
  left: number;
  tokens: ExactToken[];
}

/** Positions captured from the engine, parallel to a run's text. */
export interface CharPositions {
  /** Pen origin X per code unit; NaN where unknown. */
  starts: number[];
  /** Pen origin X plus advance per code unit; NaN where unknown. */
  ends: number[];
}

const SPACE = new Set([" ", "\t"]);

// Per-line word boxes, or null when the capture cannot place the text; the
// caller then falls back to ordinary flow.
export function buildExactLines(
  text: string,
  positions: CharPositions,
): ExactLine[] | null {
  if (text.length === 0) return null;
  if (positions.starts.length !== text.length) return null;
  if (positions.ends.length !== text.length) return null;

  const lines: ExactLine[] = [];
  let lineStart = 0;
  for (let i = 0; i <= text.length; i += 1) {
    if (i < text.length && text[i] !== "\n") continue;
    const built = buildLine(text, positions, lineStart, i);
    // A line without usable positions makes the whole run fall back, rather
    // than mixing exact and reflowed lines in one paragraph.
    if (!built) return null;
    lines.push(built);
    lineStart = i + 1;
  }
  return lines.length > 0 ? lines : null;
}

function buildLine(
  text: string,
  positions: CharPositions,
  from: number,
  to: number,
): ExactLine | null {
  // The engine trims a line's trailing spaces, so they carry no position and
  // are dropped here too; the caret still sees them in the text.
  let end = to;
  while (end > from && SPACE.has(text[end - 1])) end -= 1;
  if (end === from)
    return { left: firstFinite(positions.starts, from, to) ?? 0, tokens: [] };

  const left = positions.starts[from];
  if (!Number.isFinite(left)) return null;

  const spans: Array<{ from: number; to: number; space: boolean }> = [];
  let at = from;
  while (at < end) {
    const space = SPACE.has(text[at]);
    let stop = at;
    while (stop < end && SPACE.has(text[stop]) === space) stop += 1;
    spans.push({ from: at, to: stop, space });
    at = stop;
  }

  const tokens: ExactToken[] = [];
  for (let i = 0; i < spans.length; i += 1) {
    const span = spans[i];
    const width = span.space
      ? (spaceGap(positions, spans, i) ??
        tokenWidth(positions, span.from, span.to))
      : tokenWidth(positions, span.from, span.to);
    if (width === null) return null;
    tokens.push({
      text: text.slice(span.from, span.to),
      width,
      space: span.space,
    });
  }
  if (to > end)
    tokens.push({ text: text.slice(end, to), width: 0, space: true });
  return { left, tokens };
}

function spaceGap(
  positions: CharPositions,
  spans: Array<{ from: number; to: number; space: boolean }>,
  i: number,
): number | null {
  const next = spans[i + 1];
  if (!next) return null;
  const after = positions.starts[next.from];
  const prev = spans[i - 1];
  const before = prev
    ? positions.ends[prev.to - 1]
    : positions.starts[spans[i].from];
  if (!Number.isFinite(before) || !Number.isFinite(after)) return null;
  return after >= before ? after - before : null;
}

// A token spans its first pen origin to the last origin-plus-advance, so boxes
// tile without drift. Both endpoints must be real, never nearest-finite.
function tokenWidth(
  positions: CharPositions,
  from: number,
  to: number,
): number | null {
  const start = positions.starts[from];
  const finish = positions.ends[to - 1];
  if (!Number.isFinite(start) || !Number.isFinite(finish)) return null;
  const width = finish - start;
  return width >= 0 ? width : null;
}

function firstFinite(
  values: number[],
  from: number,
  to: number,
): number | null {
  for (let i = from; i < to; i += 1) {
    if (Number.isFinite(values[i])) return values[i];
  }
  return null;
}
