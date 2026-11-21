export type ListKind = "bullet" | "number";

const BULLET = "• ";
const LIST_MARKER = /^(?:• |\d+\. )/;
const MARKER_AT_LINE_START = /^(?:• |\d+\. )/m;

export function listIndentFor(
  text: string,
  widthOf: (line: string) => number,
): number {
  const markers = new Set(
    text.split("\n").flatMap((line) => LIST_MARKER.exec(line)?.[0] ?? []),
  );
  const base = widthOf("x");
  return Math.max(0, ...[...markers].map((m) => widthOf(`${m}x`) - base));
}

/** False for text whose first line carries no list marker, which is most text: the full check walks every line. */
export function startsWithListMarker(line: string): boolean {
  return LIST_MARKER.test(line);
}

export function mayBeList(text: string): boolean {
  return MARKER_AT_LINE_START.test(text);
}

/** The list the run's every paragraph is marked as, or null when they are not all marked alike. */
export function listKindOf(
  text: string,
  softStarts: readonly boolean[],
): ListKind | null {
  const starts = paragraphStarts(text, softStarts);
  if (starts.length === 0) return null;
  if (starts.every((line) => line.startsWith(BULLET))) return "bullet";
  if (starts.every((line) => /^\d+\. /.test(line))) return "number";
  return null;
}

/** `text` with each paragraph marked as `kind`, or unmarked when it already is. */
export function toggledListText(
  text: string,
  softStarts: readonly boolean[],
  kind: ListKind,
): string {
  const off = listKindOf(text, softStarts) === kind;
  let item = 0;
  return text
    .split("\n")
    .map((line, i) => {
      if (i > 0 && softStarts[i]) return line;
      const bare = line.replace(LIST_MARKER, "");
      if (off) return bare;
      item += 1;
      return `${kind === "bullet" ? BULLET : `${item}. `}${bare}`;
    })
    .join("\n");
}

function paragraphStarts(text: string, softStarts: readonly boolean[]) {
  return text
    .split("\n")
    .filter((line, i) => (i === 0 || !softStarts[i]) && line.trim() !== "");
}

export interface TextSplice {
  /** The characters of the typed text to replace, as code units. */
  start: number;
  end: number;
  insert: string;
}

export interface ListEdit {
  /** In order through the text, none crossing a line break. */
  splices: TextSplice[];
  /** Where the caret goes afterwards, in the text the edits leave. */
  caret: number;
}

/**
 * When `next` is `previous` with Enter pressed in a list item, the edit a word
 * processor would make: the new line becomes the next item and the numbered
 * items below it are renumbered, or, when the item left behind was empty, the
 * list ends there. `softStarts` flags `previous`'s wrapped lines, so a wrapped
 * item still counts as one; `caret` (into `next`) tells Enter at a line's end
 * from Enter on the empty line after it. Null for any other edit.
 */
export function continueList(
  previous: string,
  next: string,
  softStarts: readonly boolean[] = [],
  caret: number | null = null,
): ListEdit | null {
  const before = previous.split("\n");
  const after = next.split("\n");
  if (after.length !== before.length + 1) return null;
  const startOf = (index: number) =>
    after.slice(0, index).reduce((sum, line) => sum + line.length + 1, 0);
  const candidates = after
    .map((_, i) => i)
    .filter(
      (i) =>
        i > 0 &&
        after.slice(0, i - 1).join("\n") ===
          before.slice(0, i - 1).join("\n") &&
        after.slice(i + 1).join("\n") === before.slice(i).join("\n") &&
        (after[i - 1] === before[i - 1] ||
          after[i - 1] + after[i] === before[i - 1]),
    );
  // Around an empty line, Enter at the end of one line and Enter on the next
  // leave the same text; only the caret tells them apart.
  let added =
    caret === null
      ? (candidates[0] ?? -1)
      : (candidates.find(
          (i) => caret >= startOf(i) && caret <= startOf(i) + after[i].length,
        ) ?? -1);
  if (added <= 0 || LIST_MARKER.test(after[added])) return null;
  let split = after[added - 1] !== before[added - 1];
  // Enter at the start of a wrapped line and Enter at the end of the line it
  // wraps from are the same keystroke.
  if (
    split &&
    after[added - 1] === "" &&
    softStarts[added - 1] &&
    candidates.includes(added - 1)
  ) {
    added -= 1;
    split = false;
  }
  let itemLine = added - 1;
  while (itemLine > 0 && softStarts[itemLine]) itemLine--;
  const item = after[itemLine].match(/^(• |(\d+)\. )(.*)$/);
  if (!item) return null;
  if (!split && itemLine === added - 1 && item[3].trim() === "") {
    if (after[added] !== "") return null;
    const emptied = startOf(added - 1);
    // Taken with the line break before it, so the caret stays on the fresh
    // line: Firefox merges the lines a deletion past a line break joins.
    if (added - 1 > 0)
      return {
        splices: [
          {
            start: emptied - 1,
            end: emptied + after[added - 1].length,
            insert: "",
          },
        ],
        caret: emptied,
      };
    return {
      splices: [{ start: emptied, end: startOf(added), insert: "" }],
      caret: emptied,
    };
  }
  // Enter where the item wrapped leaves an empty line before the wrapped
  // rest; that rest becomes the new item instead.
  const atWrap = after[added] === "" && softStarts[added] === true;
  const newLine = atWrap ? added + 1 : added;
  const splices: TextSplice[] = atWrap
    ? [{ start: startOf(added) - 1, end: startOf(added), insert: "" }]
    : [];
  const number = item[2] ? parseInt(item[2], 10) + 1 : null;
  const marker = number === null ? BULLET : `${number}. `;
  splices.push({
    start: startOf(newLine),
    end: startOf(newLine),
    insert: marker,
  });
  if (number !== null)
    for (let i = newLine + 1, n = number + 1; i < after.length; i++) {
      if (softStarts[i - 1]) continue;
      const old = after[i].match(/^\d+\. /);
      if (!old) break;
      const renumbered = `${n++}. `;
      if (old[0] !== renumbered)
        splices.push({
          start: startOf(i),
          end: startOf(i) + old[0].length,
          insert: renumbered,
        });
    }
  return {
    splices,
    caret: atWrap
      ? startOf(newLine) - 1 + marker.length
      : startOf(added) + marker.length + (split ? 0 : after[added].length),
  };
}
