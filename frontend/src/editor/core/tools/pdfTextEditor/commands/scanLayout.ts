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
  /** Spaces the scan's own text has before it beyond the separating one. */
  lead?: number;
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
  /** How wide typed text draws, in the style of the word it replaces; `replaced` lists every scanned word it stands for, `anchor` first. */
  textWidth: (
    text: string,
    anchor: LayoutWord | null,
    replaced: LayoutWord[],
  ) => number;
  /** Redraw every word as text (a restyle), instead of keeping the scan. */
  redraw: boolean;
}

export interface PlacedWord {
  word: LayoutWord;
  x: number;
  line: number;
  baseline: number;
  /** False when the word stays exactly where the scan has it. */
  moved: boolean;
}

export interface TypedText {
  text: string;
  x: number;
  line: number;
  baseline: number;
  /** The scanned word it replaces, if any: its style, and where it started. */
  anchor: LayoutWord | null;
  /** True when it starts exactly where `anchor` did. */
  atAnchor: boolean;
  /** Every scanned word it replaces, `anchor` first. */
  replaced: LayoutWord[];
}

export interface Layout {
  kept: PlacedWord[];
  removed: LayoutWord[];
  typed: TypedText[];
}

type Op =
  | { kind: "keep"; word: LayoutWord; line: number; lead: number }
  | { kind: "del"; word: LayoutWord }
  | { kind: "ins"; text: string; line: number; lead: number };

interface Token {
  text: string;
  line: number;
  /** Spaces typed before the word beyond the one that separates words. */
  lead: number;
}

function tokensOf(text: string): Token[] {
  return text.split("\n").flatMap((t, line) =>
    [...t.matchAll(/( *)(\S+)/g)].map((found, i) => ({
      text: found[2],
      line,
      lead: Math.max(0, found[1].length - (i === 0 ? 0 : 1)),
    })),
  );
}

// Longest common subsequence of the scan's words and the new words, as ops.
function align(words: LayoutWord[], tokens: Token[]): Op[] {
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
      const { line, lead } = tokens[j++];
      ops.push({ kind: "keep", word: words[i++], line, lead });
    } else if (j < m && (i >= n || lcs[i][j + 1] >= lcs[i + 1][j])) {
      ops.push({ kind: "ins", ...tokens[j++] });
    } else {
      ops.push({ kind: "del", word: words[i++] });
    }
  }
  return ops;
}

const SNAP_BACK = 0.75;

export function layoutScanEdit(input: LayoutInput): Layout {
  const { lines } = input;
  const words = lines.flatMap((l) => l.words).filter((w) => w.text);
  const tokens = tokensOf(input.text);
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
  const besideInScan = (a: LayoutWord, b: LayoutWord) =>
    a.line === b.line &&
    !lines[a.line].words.slice(a.index + 1, b.index).some((w) => w.text);
  // Words that sat side by side in the scan keep the gap they had.
  const gap = (a: LayoutWord | null, b: LayoutWord | null) =>
    !a || !b || !besideInScan(a, b)
      ? input.space
      : b.x - (a.x + input.wordWidth(a));

  const layout: Layout = { kept: [], removed: [], typed: [] };
  let pen: (() => number) | null = null;
  let lastKept: { word: LayoutWord; x: number } | null = null;
  let penLine = -1;
  let prev: LayoutWord | null = null;
  // Removed words since the last kept one: the first stands for typed text.
  let dels: LayoutWord[] = [];
  let pending: { text: string; lead: number; line: number } | null = null;

  const startLine = (line: number) => {
    if (line === penLine) return;
    pen = null;
    prev = null;
    lastKept = null;
    penLine = line;
  };
  const flushTyped = () => {
    if (!pending) return;
    const anchor = dels[0] ?? null;
    const line = pending.line;
    // A line starts where it always did, so deleting its first word pulls
    // the rest left rather than leaving a hole.
    const scannedLead = anchor && anchor.line === line ? (anchor.lead ?? 0) : 0;
    const x =
      (pen === null ? lineStart(line) : pen() + gap(prev, anchor)) +
      Math.max(0, pending.lead - scannedLead) * input.space;
    const text = pending.text;
    layout.typed.push({
      text,
      x,
      line,
      baseline: baselineOf(line),
      anchor,
      atAnchor:
        !!anchor && anchor.line === line && Math.abs(x - anchor.x) < 0.5,
      replaced: dels,
    });
    const end = x + input.textWidth(text, anchor, dels);
    pen = () => end;
    prev = anchor;
    lastKept = null;
    dels = [];
    pending = null;
  };

  const flowStart = (w: LayoutWord, line: number): number => {
    if (pen === null) return lineStart(line);
    if (lastKept && besideInScan(lastKept.word, w))
      return w.x + (lastKept.x - lastKept.word.x);
    return pen() + gap(prev, w);
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
      if (pending) pending.text += " ".repeat(op.lead + 1) + op.text;
      else pending = { text: op.text, lead: op.lead, line: op.line };
      continue;
    }
    if (pending && pending.line !== op.line) flushTyped();
    startLine(op.line);
    flushTyped();
    const w = op.word;
    // The scan's own gap already shows the spaces its text came with.
    const extra = Math.max(0, op.lead - (w.lead ?? 0));
    const flowed = flowStart(w, op.line) + extra * input.space;
    const x =
      extra === 0 &&
      w.line === op.line &&
      Math.abs(flowed - w.x) < input.space * SNAP_BACK
        ? w.x
        : flowed;
    const baseline = baselineOf(op.line);
    layout.kept.push({
      word: w,
      x,
      line: op.line,
      baseline,
      moved: w.line !== op.line || Math.abs(x - w.x) > 0.3,
    });
    pen = () => x + input.wordWidth(w);
    prev = w;
    lastKept = { word: w, x };
    dels = [];
  }
  flushTyped();
  return layout;
}

/** `text` reflowed so every line `fits` by swapping only spaces and line breaks, so offsets and the caret hold; adds a line only when `canAddLine`, and a word too wide stays put. */
export function rewrapLines(
  text: string,
  fits: (line: string) => boolean,
  canAddLine: boolean,
): string {
  const chars = [...text];
  if (chars.length !== text.length) return text;
  let start = 0;
  while (start < chars.length) {
    let end = chars.indexOf("\n", start);
    if (end < 0) end = chars.length;
    while (!fits(chars.slice(start, end).join("").trim())) {
      const at = lastBreak(chars, start, end);
      if (at < 0) break;
      const nextEnd = chars.indexOf("\n", end + 1);
      const next = chars
        .slice(end + 1, nextEnd < 0 ? chars.length : nextEnd)
        .join("");
      const joins = end < chars.length && next.trim() !== "";
      if (!joins && !canAddLine) break;
      if (joins) chars[end] = " ";
      chars[at] = "\n";
      end = at;
    }
    start = end + 1;
  }
  return chars.join("");
}

// The last space on [start, end) with a word on both sides of it.
function lastBreak(chars: string[], start: number, end: number): number {
  let at = end - 1;
  while (at > start && chars[at] === " ") at--;
  while (at > start && chars[at] !== " ") at--;
  if (at <= start || chars[at] !== " ") return -1;
  return chars.slice(start, at).some((ch) => ch !== " ") ? at : -1;
}
