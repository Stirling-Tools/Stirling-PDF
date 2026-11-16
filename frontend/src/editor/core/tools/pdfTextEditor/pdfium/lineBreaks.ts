/**
 * Tells the line breaks a document came with apart: soft where the producer
 * wrapped a line because the next word would not fit before the margin, hard
 * where the author ended the line. A reflow joins soft breaks and keeps hard
 * ones, so widening a box rejoins only what the margin split.
 *
 * Unsure cases read hard, since a wrongly joined line is a visible edit the
 * user did not ask for and a wrongly kept break is just today's behaviour.
 */

export interface BreakLine {
  text: string;
  left: number;
  right: number;
  fontSize: number;
}

const SPACE_EM = 0.25;
const FIT_SLACK_EM = 0.3;
const LEFT_TOLERANCE_EM = 0.6;
const MIN_LEFT_TOLERANCE_PT = 3;

const ITEM_OR_ROW_START =
  /^\s*(?:[•·▪‣◦●○■□►➢✓✔*\-–—|]\s|\+[-=]|\(?(?:\d{1,3}|[a-z]|[ivxlc]{1,5})[.)]\s)/i;
// A hyphen or soft hyphen at a line end may belong to the word ("well-
// known") or only to the hyphenation; joining cannot tell which to keep.
const ENDS_IN_HYPHEN = /[-­‐‑]\s*$/;

/**
 * One flag per line, true when the line starts at a soft break. Line 0 is
 * never soft. `marginRight` is the right edge the column's text wraps at; the
 * widest line of `lines` is used when it reaches further.
 */
export function softLineStarts(
  lines: readonly BreakLine[],
  marginRight = -Infinity,
): boolean[] {
  const flags = lines.map(() => false);
  if (lines.length < 2) return flags;
  const margin = Math.max(marginRight, ...lines.map((l) => l.right));
  const bodyLeft = medianOf(lines.slice(1).map((l) => l.left));
  for (let i = 1; i < lines.length; i++) {
    const above = lines[i - 1];
    const line = lines[i];
    if (!above.text.trim() || !line.text.trim()) continue;
    if (ENDS_IN_HYPHEN.test(above.text) || ITEM_OR_ROW_START.test(line.text))
      continue;
    const em = line.fontSize > 0 ? line.fontSize : 12;
    const leftTolerance = Math.max(
      MIN_LEFT_TOLERANCE_PT,
      em * LEFT_TOLERANCE_EM,
    );
    if (Math.abs(line.left - bodyLeft) > leftTolerance) continue;
    const nextWordEnd = above.right + em * SPACE_EM + firstWordWidth(line);
    flags[i] = nextWordEnd > margin - em * FIT_SLACK_EM;
  }
  return flags;
}

function firstWordWidth(line: BreakLine): number {
  const text = line.text.trim();
  if (!text) return 0;
  const word = text.split(/\s+/)[0];
  return ((line.right - line.left) / text.length) * word.length;
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/**
 * `flags` re-indexed onto the lines of `text`, when they were classified for
 * `flaggedText`. Breaks in the unchanged head and tail keep their flag; a
 * break that replaced a space in place is a rewrap's and reads soft; any
 * other new break was typed and reads hard.
 */
export function softStartsFor(
  text: string,
  flaggedText: string,
  flags: readonly boolean[],
): boolean[] {
  if (text === flaggedText) return [...flags];
  const oldFlagAt = new Map<number, boolean>();
  let line = 0;
  for (let i = 0; i < flaggedText.length; i++)
    if (flaggedText[i] === "\n") oldFlagAt.set(i, flags[++line] ?? false);
  let head = 0;
  const shortest = Math.min(text.length, flaggedText.length);
  while (head < shortest && text[head] === flaggedText[head]) head++;
  let tail = 0;
  while (
    tail < shortest - head &&
    text[text.length - 1 - tail] === flaggedText[flaggedText.length - 1 - tail]
  )
    tail++;
  const shift = flaggedText.length - text.length;
  const sameLengthMiddle = shift === 0;
  const out = [false];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "\n") continue;
    if (i < head) out.push(oldFlagAt.get(i) ?? false);
    else if (i >= text.length - tail)
      out.push(oldFlagAt.get(i + shift) ?? false);
    else if (sameLengthMiddle && flaggedText[i] === "\n")
      out.push(oldFlagAt.get(i) ?? false);
    else out.push(sameLengthMiddle && flaggedText[i] === " ");
  }
  return out;
}

/** `run`'s soft-start flags for the lines of its current text. */
export function softStartsOf(run: {
  text: string;
  paragraphSoftStarts: readonly boolean[];
  paragraphSoftStartsText: string;
}): boolean[] {
  return softStartsFor(
    run.text,
    run.paragraphSoftStartsText,
    run.paragraphSoftStarts,
  );
}
