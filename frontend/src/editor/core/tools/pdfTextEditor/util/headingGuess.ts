/**
 * Guessing which untagged text blocks are headings, and at what level, from
 * how they are set: a document's body text is the style carrying the most
 * characters, and a short block set larger than that, or as large but
 * emphasised (bolder, or in a colour where the body is not), reads as a
 * heading. Larger styles rank higher, the more emphasised above
 * the less at one size, so each distinct heading style gets one level across
 * the whole document.
 */
import type { DisplayTransformData } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import type { HeadingType } from "@editor/tools/pdfTextEditor/model/structureTypes";
import type { PageRect, RGBA } from "@editor/tools/pdfTextEditor/types";
import { tableRowCells } from "@editor/tools/pdfTextEditor/util/tableRow";

/** The grid, in points, sizes are rounded to so a style read back a little off its size still counts as one. */
const SIZE_STEP_PT = 0.5;
/** How much larger than the body text a block must be set to read as a heading on size alone. */
const LARGER = 1.15;
/** How far apart, out of 255, a colour's channels must be for it to read as a colour rather than a grey. */
const CHROMA = 64;
/** The grid, out of 255 per channel, colours are rounded to so near-identical ones count as one. */
const COLOUR_STEP = 32;
/** The longest text, in characters, a heading is taken to have. */
const MAX_HEADING_CHARS = 120;
const MAX_HEADING_LINES = 3;
/** How many short items, separated by commas or the like, make a list such as an author line. */
const LIST_ITEMS = 3;
/** Same-style blocks on one line that make a table row, such as a header row. Fewer than furniture needs: headings rarely stand three abreast. */
const HEADING_ROW_CELLS = 3;
const MAX_LIST_ITEM_WORDS = 4;
const HEADING_TYPES: readonly HeadingType[] = [
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
];
const LETTER = /\p{L}/gu;
const DIGIT = /\p{Nd}/gu;
/** Punctuation a heading does not end on: a sentence's, or a form label's colon. A question mark it can. */
const SENTENCE_END = /[.,;:]$/;
const OPENING_QUOTE = /^["'«‘“„]/u;
/** Text wholly in brackets, such as "[2 marks]" or "(continued)". */
const BRACKETED = /^[([{].*[)\]}]$/su;
const LIST_SEPARATOR = /[,;|·]/;

export interface HeadingRun {
  id: string;
  text: string;
  /** In points, as displayed. */
  fontSize: number;
  bold: boolean;
  fill: RGBA;
  bounds: PageRect;
}

export interface HeadingPage {
  pageIndex: number;
  /** Every run on the page, the ones already tagged included, since they show how the body text is set. */
  runs: readonly HeadingRun[];
  /** The ids of the runs auto-tag will add elements for, in the order those join the structure tree. */
  tagged: readonly string[];
  /** How the page is turned for display, so table rows are read along displayed lines. */
  display: DisplayTransformData | null;
}

interface Style {
  size: number;
  bold: boolean;
  /** The colour's key, or null for black, white or a grey. */
  colour: string | null;
}

/**
 * The `tagged` runs on `pages` that read as headings, by page index and then
 * run id, each with its level. Runs `skip` names, such as page furniture, are
 * neither guessed nor counted towards the body text. Pass every page the
 * document has read, since one page alone may not show the body text's style.
 * Levels never skip in page order and then `tagged` order, so the first
 * heading is H1 and each is at most one deeper than the one before it, as
 * PDF/UA-1 (ISO 14289-1, 7.4.2) requires of a structure tree that holds no
 * other headings and adds pages' elements in page order. A heading's level is
 * how many larger-ranked headings are still open above it, so headings of one
 * style under the same parent share a level. Two heading styles of one size
 * and emphasis rank in the order they first appear.
 */
export function guessHeadings(
  pages: readonly HeadingPage[],
  skip: ReadonlyMap<number, ReadonlyMap<string, unknown>> = new Map(),
): Map<number, Map<string, HeadingType>> {
  const inOrder = [...pages].sort((a, b) => a.pageIndex - b.pageIndex);
  const runs = inOrder.flatMap(({ pageIndex, runs: all, display }) => {
    const kept = all
      .filter((run) => !skip.get(pageIndex)?.has(run.id))
      .map((run) => {
        const style = styleOf(run);
        return { run, style, key: styleKey(style) };
      });
    const rowCells = tableRowCells(
      kept.map(({ run, key }) => ({ bounds: run.bounds, key, run })),
      display,
      { keyOf: (cell) => cell.key, cells: HEADING_ROW_CELLS },
    );
    const inRow = new Set([...rowCells].map((cell) => cell.run));
    return kept.map(({ run, style, key }) => ({
      pageIndex,
      run,
      style,
      key,
      chars: run.text.replace(/\s+/g, "").length,
      candidate: readsAsHeading(run.text) && !inRow.has(run),
    }));
  });

  const totals = new Map<
    string,
    { style: Style; chars: number; candidates: number; blocks: number }
  >();
  for (const { style, key, chars, candidate } of runs) {
    const total = totals.get(key) ?? {
      style,
      chars: 0,
      candidates: 0,
      blocks: 0,
    };
    total.chars += chars;
    if (candidate) {
      total.candidates += chars;
      total.blocks++;
    }
    totals.set(key, total);
  }
  let body: Style | null = null;
  let bodyChars = 0;
  for (const { style, chars } of totals.values()) {
    if (chars > bodyChars) [body, bodyChars] = [style, chars];
  }
  const headings = new Map<number, Map<string, HeadingType>>();
  if (!body) return headings;

  // A style mostly set in blocks that read as anything but headings, such as
  // a lead paragraph or table cells, is not a heading style, and takes no
  // level from the styles that are. Nor is one only blocks auto-tag leaves
  // alone are set in, such as a title the file has tagged already.
  const written = new Set(
    inOrder.flatMap(({ pageIndex, tagged }) =>
      tagged.map((id) => `${pageIndex}:${id}`),
    ),
  );
  const writtenStyles = new Set(
    runs
      .filter(
        ({ pageIndex, run, candidate }) =>
          candidate && written.has(`${pageIndex}:${run.id}`),
      )
      .map(({ key }) => key),
  );
  const headingStyles = [...totals.entries()]
    .filter(
      ([key, { style, chars, candidates }]) =>
        writtenStyles.has(key) &&
        outranks(style, body) &&
        candidates * 2 >= chars,
    )
    .map(([, total]) => total)
    .sort(
      (a, b) =>
        b.style.size - a.style.size ||
        emphasis(b.style, body) - emphasis(a.style, body),
    );
  // A style set once below the top, such as a cover's subtitle or a lone
  // "Abstract", shares the level above rather than pushing every heading
  // under it a level deeper.
  const ranks = new Map<string, number>();
  let rank = -1;
  for (const [index, { style, blocks }] of headingStyles.entries()) {
    if (index === 0 || blocks > 1) rank++;
    ranks.set(styleKey(style), rank);
  }

  // The ranks of the headings still open above the next one: each heading
  // closes those ranked as or less important than itself, so the stack grows
  // by at most one a heading and a level is never skipped, where capping a
  // heading at one below the last would push siblings of one style apart.
  // Ranks stay distinct past H6 so deep styles still nest; only the level
  // written is capped.
  // Only runs auto-tag will write count: one it leaves alone adds no element.
  const byId = new Map(
    runs.map((entry) => [`${entry.pageIndex}:${entry.run.id}`, entry]),
  );
  const open: number[] = [];
  for (const { pageIndex, tagged } of inOrder) {
    for (const id of tagged) {
      const entry = byId.get(`${pageIndex}:${id}`);
      const styleRank = entry?.candidate ? ranks.get(entry.key) : undefined;
      if (styleRank === undefined) continue;
      while (open.length > 0 && open[open.length - 1] >= styleRank) open.pop();
      const onPage = headings.get(pageIndex) ?? new Map<string, HeadingType>();
      const level = Math.min(open.length, HEADING_TYPES.length - 1);
      headings.set(pageIndex, onPage.set(id, HEADING_TYPES[level]));
      open.push(styleRank);
    }
  }
  return headings;
}

function styleOf(run: HeadingRun): Style {
  const { r, g, b } = run.fill;
  const chromatic = Math.max(r, g, b) - Math.min(r, g, b) >= CHROMA;
  return {
    size: Math.round(run.fontSize / SIZE_STEP_PT) * SIZE_STEP_PT,
    bold: run.bold,
    colour: chromatic
      ? [r, g, b].map((c) => Math.round(c / COLOUR_STEP)).join(",")
      : null,
  };
}

function styleKey({ size, bold, colour }: Style): string {
  return `${size}${bold ? "b" : ""}@${colour ?? ""}`;
}

function outranks(style: Style, body: Style): boolean {
  if (style.size >= body.size * LARGER) return true;
  return style.size >= body.size && emphasis(style, body) > 0;
}

/** How far `style` stands out from the body text at its size: bold over a colour, both over either. */
function emphasis(style: Style, body: Style): number {
  return (
    2 * Number(style.bold && !body.bold) +
    Number(style.colour !== null && style.colour !== body.colour)
  );
}

/**
 * Text a heading could have: a few words on a line or so, and none of what
 * is set large or bold without being one: a sentence, a form label, a lone
 * letter such as a drop cap, a figure such as "42%", a pull quote, an aside
 * in brackets, or a list of short items such as an author line.
 */
function readsAsHeading(text: string): boolean {
  const trimmed = text.trim();
  const letters = trimmed.match(LETTER)?.length ?? 0;
  const digits = trimmed.match(DIGIT)?.length ?? 0;
  return (
    trimmed.length <= MAX_HEADING_CHARS &&
    trimmed.split("\n").length <= MAX_HEADING_LINES &&
    letters >= 2 &&
    digits < letters &&
    !SENTENCE_END.test(trimmed) &&
    !OPENING_QUOTE.test(trimmed) &&
    !BRACKETED.test(trimmed) &&
    !isShortList(trimmed)
  );
}

function isShortList(text: string): boolean {
  const items = text.split(LIST_SEPARATOR).map((item) => item.trim());
  return (
    items.length >= LIST_ITEMS &&
    items.every(
      (item) => item.split(/\s+/).filter(Boolean).length <= MAX_LIST_ITEM_WORDS,
    )
  );
}
