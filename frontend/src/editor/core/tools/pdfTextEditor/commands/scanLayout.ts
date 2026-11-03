// Where every word of an edited scanned block goes. Pure geometry: words the
// user kept stay the scan's own pixels (moved only if something before them
// grew, shrank or wrapped), typed words are drawn, removed words are covered.

export interface LayoutWord {
  line: number;
  /** Position among its line's words. */
  index: number;
  text: string;
  /** OCR left edge, raw page x. */
  x: number;
}

export interface LayoutLine {
  baseline: number;
  words: LayoutWord[];
}

export interface LayoutInput {
  lines: LayoutLine[];
  text: string;
  /** Baseline-to-baseline distance for lines added below the block. */
  pitch: number;
  /** Gap between words that did not sit side by side in the scan. */
  space: number;
  /** How wide a kept word's ink is. */
  wordWidth: (w: LayoutWord) => number;
  /** How wide typed text draws, in the style of the word it replaces. */
  textWidth: (text: string, anchor: LayoutWord | null) => number;
  /** Redraw every word as text (a restyle), instead of keeping the scan. */
  redraw: boolean;
}

export interface PlacedWord {
  word: LayoutWord;
  x: number;
  baseline: number;
  /** False when the word stays exactly where the scan has it. */
  moved: boolean;
}

export interface TypedText {
  text: string;
  x: number;
  baseline: number;
  /** The scanned word it replaces, if any: its style, and where it started. */
  anchor: LayoutWord | null;
  /** True when it starts exactly where `anchor` did. */
  atAnchor: boolean;
}

export interface Layout {
  kept: PlacedWord[];
  removed: LayoutWord[];
  typed: TypedText[];
}

type Op =
  | { kind: "keep"; word: LayoutWord; line: number }
  | { kind: "del"; word: LayoutWord }
  | { kind: "ins"; text: string; line: number };

// Longest common subsequence of the scan's words and the new words, as ops.
function align(
  words: LayoutWord[],
  tokens: Array<{ text: string; line: number }>,
): Op[] {
  const n = words.length;
  const m = tokens.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i][j] =
        words[i].text === tokens[j].text
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && words[i].text === tokens[j].text) {
      ops.push({ kind: "keep", word: words[i++], line: tokens[j++].line });
    } else if (j < m && (i >= n || lcs[i][j + 1] >= lcs[i + 1][j])) {
      ops.push({ kind: "ins", text: tokens[j].text, line: tokens[j++].line });
    } else {
      ops.push({ kind: "del", word: words[i++] });
    }
  }
  return ops;
}

export function layoutScanEdit(input: LayoutInput): Layout {
  const { lines } = input;
  const words = lines.flatMap((l) => l.words).filter((w) => w.text);
  const newLines = input.text.split("\n");
  const tokens = newLines.flatMap((t, line) =>
    t
      .split(/\s+/)
      .filter(Boolean)
      .map((text) => ({ text, line })),
  );
  const ops: Op[] = input.redraw
    ? [
        ...words.map((word): Op => ({ kind: "del", word })),
        ...tokens.map((t): Op => ({ kind: "ins", ...t })),
      ]
    : align(words, tokens);

  const last = lines.length - 1;
  const baselineOf = (line: number) =>
    line <= last
      ? lines[line].baseline
      : lines[last].baseline - (line - last) * input.pitch;
  const lineStart = (line: number) =>
    (lines[line] ?? lines[0]).words.find((w) => w.text)?.x ??
    lines[0].words[0].x;
  // Words that sat side by side in the scan keep the gap they had.
  const gap = (a: LayoutWord | null, b: LayoutWord | null) => {
    if (!a || !b || a.line !== b.line) return input.space;
    const between = lines[a.line].words.slice(a.index + 1, b.index);
    if (between.some((w) => w.text)) return input.space;
    return b.x - (a.x + input.wordWidth(a));
  };

  const layout: Layout = { kept: [], removed: [], typed: [] };
  let pen: number | null = null;
  let penLine = -1;
  let prev: LayoutWord | null = null;
  // Removed words since the last kept one: the first stands for typed text.
  let dels: LayoutWord[] = [];
  let pending: { text: string[]; line: number } | null = null;

  const startLine = (line: number) => {
    if (line === penLine) return;
    pen = null;
    prev = null;
    penLine = line;
  };
  const flushTyped = () => {
    if (!pending) return;
    const anchor = dels[0] ?? null;
    const line = pending.line;
    // A line starts where it always did, so deleting its first word pulls
    // the rest left rather than leaving a hole.
    const x = pen === null ? lineStart(line) : pen + gap(prev, anchor);
    const text = pending.text.join(" ");
    layout.typed.push({
      text,
      x,
      baseline: baselineOf(line),
      anchor,
      atAnchor:
        !!anchor && anchor.line === line && Math.abs(x - anchor.x) < 0.5,
    });
    pen = x + input.textWidth(text, anchor);
    prev = anchor;
    dels = [];
    pending = null;
  };

  for (const op of ops) {
    if (op.kind === "del") {
      layout.removed.push(op.word);
      dels.push(op.word);
      continue;
    }
    if (op.kind === "ins") {
      if (pending && pending.line !== op.line) flushTyped();
      startLine(op.line);
      pending ??= { text: [], line: op.line };
      pending.text.push(op.text);
      continue;
    }
    if (pending && pending.line !== op.line) flushTyped();
    startLine(op.line);
    flushTyped();
    const w = op.word;
    const x: number = pen === null ? lineStart(op.line) : pen + gap(prev, w);
    const baseline = baselineOf(op.line);
    layout.kept.push({
      word: w,
      x,
      baseline,
      moved: w.line !== op.line || Math.abs(x - w.x) > 0.3,
    });
    pen = x + input.wordWidth(w);
    prev = w;
    dels = [];
  }
  flushTyped();
  return layout;
}
