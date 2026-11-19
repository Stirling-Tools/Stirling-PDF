/**
 * Guessing which untagged text blocks are headings, and at what level, from
 * how they are set: a document's body text is the style carrying the most
 * characters, and a short block set larger than that, or as large but
 * emphasised (bolder, or in a colour where the body is not), reads as a
 * heading. Larger styles rank higher, the more emphasised above
 * the less at one size, so each distinct heading style gets one level across
 * the whole document.
 */
import type { HeadingType } from "@editor/tools/pdfTextEditor/model/structureTypes";
import type { PageRect, RGBA } from "@editor/tools/pdfTextEditor/types";
import { inTableRow } from "@editor/tools/pdfTextEditor/util/tableRow";

/** Sizes this close, in points, count as one: the same style rarely reads back to the exact same size. */
const SIZE_STEP_PT = 0.5;
/** How much larger than the body text a block must be set to read as a heading on size alone. */
const LARGER = 1.15;
/** How far apart, out of 255, a colour's channels must be for it to read as a colour rather than a grey. */
const CHROMA = 64;
/** Colours this close, out of 255 per channel, count as one. */
const COLOUR_STEP = 32;
/** The longest text, in characters, a heading is taken to have. */
const MAX_HEADING_CHARS = 120;
const MAX_HEADING_LINES = 3;
/** How many short items, separated by commas or the like, make a list such as an author line. */
const LIST_ITEMS = 3;
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

export interface HeadingPage<R extends HeadingRun = HeadingRun> {
  pageIndex: number;
  runs: readonly R[];
}

interface Style {
  size: number;
  bold: boolean;
  /** The colour's key, or null for black, white or a grey. */
  colour: string | null;
}

/**
 * The runs on `pages` that read as headings, by page index and then run id,
 * each with its level. Runs `skip` names, such as page furniture, are neither
 * guessed nor counted towards the body text. Pass every page the document
 * has read, since one page alone may not show the body text's style.
 */
export function guessHeadings(
  pages: readonly HeadingPage[],
  skip: ReadonlyMap<number, ReadonlyMap<string, unknown>> = new Map(),
): Map<number, Map<string, HeadingType>> {
  const runs = pages.flatMap(({ pageIndex, runs: all }) => {
    const kept = all.filter((run) => !skip.get(pageIndex)?.has(run.id));
    return kept.map((run) => ({
      pageIndex,
      run,
      style: styleOf(run),
      chars: run.text.replace(/\s+/g, "").length,
      candidate: readsAsHeading(run.text) && !inStyledRow(run, kept),
    }));
  });

  const totals = new Map<
    string,
    { style: Style; chars: number; candidates: number; blocks: number }
  >();
  for (const { style, chars, candidate } of runs) {
    const key = styleKey(style);
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
  // level from the styles that are.
  const headingStyles = [...totals.values()]
    .filter(
      ({ style, chars, candidates }) =>
        outranks(style, body) && candidates * 2 >= chars,
    )
    .sort(
      (a, b) =>
        b.style.size - a.style.size ||
        emphasis(b.style, body) - emphasis(a.style, body),
    );
  // A style set once below the top, such as a cover's subtitle or a lone
  // "Abstract", shares the level above rather than pushing every heading
  // under it a level deeper.
  const levels = new Map<string, HeadingType>();
  let rank = -1;
  for (const [index, { style, blocks }] of headingStyles.entries()) {
    if (index === 0 || blocks > 1) rank++;
    levels.set(
      styleKey(style),
      HEADING_TYPES[Math.min(Math.max(rank, 0), HEADING_TYPES.length - 1)],
    );
  }

  for (const { pageIndex, run, style, candidate } of runs) {
    const level = levels.get(styleKey(style));
    if (!level || !candidate) continue;
    const onPage = headings.get(pageIndex) ?? new Map<string, HeadingType>();
    headings.set(pageIndex, onPage.set(run.id, level));
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

/**
 * Whether `run` is a cell of a table row set in its style, such as a header
 * row. Three cells make a row here, where a running header split in three is
 * still furniture: headings rarely stand three abreast.
 */
function inStyledRow(run: HeadingRun, page: readonly HeadingRun[]): boolean {
  const style = styleKey(styleOf(run));
  return inTableRow(
    run,
    page,
    (other) => styleKey(styleOf(other)) === style,
    HEADING_ROW_CELLS,
  );
}
