import {
  defaultParameters as defaultBookletParameters,
  validateBookletImpositionParameters,
} from "@app/hooks/tools/bookletImposition/useBookletImpositionParameters";
import type { BookletImpositionParameters } from "@app/hooks/tools/bookletImposition/useBookletImpositionParameters";
import { bookletImpositionToApiParams } from "@app/hooks/tools/bookletImposition/useBookletImpositionOperation";
import {
  defaultParameters as defaultLayoutParameters,
  validatePageLayoutParameters,
} from "@app/hooks/tools/pageLayout/usePageLayoutParameters";
import type { PageLayoutParameters } from "@app/hooks/tools/pageLayout/usePageLayoutParameters";
import { pageLayoutToApiParams } from "@app/hooks/tools/pageLayout/usePageLayoutOperation";
import type {
  ToolApiParams,
  ToolApiRequest,
  ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";

/** Layouts the print dialog offers. Each one maps onto an operation that already exists. */
export type PrintPreset = "standard" | "pagesPerSheet" | "booklet" | "poster";

export const PRINT_PRESETS: PrintPreset[] = [
  "standard",
  "pagesPerSheet",
  "booklet",
  "poster",
];

const PAGE_LAYOUT_ENDPOINT =
  "/api/v1/general/multi-page-layout" satisfies ToolEndpoint;
const BOOKLET_ENDPOINT =
  "/api/v1/general/booklet-imposition" satisfies ToolEndpoint;
const POSTER_ENDPOINT =
  "/api/v1/general/split-for-poster-print" satisfies ToolEndpoint;

export type PosterPageSize = ToolApiParams[typeof POSTER_ENDPOINT]["pageSize"];

export const POSTER_PAGE_SIZES: PosterPageSize[] = [
  "A4",
  "A3",
  "A5",
  "Letter",
  "Legal",
  "Tabloid",
];

/** `PosterPdfRequest` takes 1 to 10 tiles per axis; the inputs promise the same. */
export const POSTER_MIN_TILES = 1;
export const POSTER_MAX_TILES = 10;

/** An overhang stays a rim around each tile, never half of one: 0 to 50 pt. */
export const POSTER_MAX_OVERHANG = 50;

const isOverhangValid = (overhang: number): boolean =>
  Number.isFinite(overhang) && overhang >= 0 && overhang <= POSTER_MAX_OVERHANG;

export interface PosterSettings {
  pageSize: PosterPageSize;
  xFactor: number;
  yFactor: number;
  rightToLeft: boolean;
  /**
   * Overhang in points: each tile keeps this much past its grid edges, so
   * assembled sheets keep their shared border content after trimming.
   */
  overlap: number;
}

/**
 * Which pages a range keeps. Odd and even are the two passes of a manual duplex
 * run, which is why they filter a range instead of replacing it.
 */
export type PageParity = "all" | "odd" | "even";

export const isPageParity = (value: unknown): value is PageParity =>
  value === "all" || value === "odd" || value === "even";

export interface PrintSettings {
  preset: PrintPreset;
  /**
   * Only the standard preset can honour a range: no imposition request carries
   * one, so the imposed presets print the whole document.
   */
  pageRange: string;
  /**
   * The filter the standard preset applies to that range, kept apart from the
   * field the reader types so going back to all restores what they wrote.
   */
  parity: PageParity;
  includeAnnotations: boolean;
  layout: PageLayoutParameters;
  booklet: BookletImpositionParameters;
  poster: PosterSettings;
}

/**
 * Where the bytes to print come from. A viewer job is rendered by the viewer
 * itself; a server job is an imposition the backend has to produce first.
 */
export type PrintJob =
  | { kind: "viewer"; pageRange?: string; includeAnnotations: boolean }
  | {
      kind: "server";
      endpoint: ToolEndpoint;
      request: ToolApiRequest;
      suffix: string;
    };

export const defaultPrintSettings = (): PrintSettings => ({
  preset: "standard",
  pageRange: "",
  parity: "all",
  includeAnnotations: true,
  layout: { ...defaultLayoutParameters },
  booklet: { ...defaultBookletParameters },
  poster: {
    pageSize: "A4",
    xFactor: 2,
    yFactor: 2,
    rightToLeft: false,
    overlap: 0,
  },
});

/**
 * The job these settings describe. The engine applies a range ascending only
 * (a "2,1" job prints page 1 first) and has no parity token, so an odd or even
 * job states the pages it selects, which needs a page count; callers hand over
 * settings `printProblem` accepts.
 */
export function buildPrintJob(
  settings: PrintSettings,
  pageCount = 0,
): PrintJob {
  const pageRange = settings.pageRange.trim();

  switch (settings.preset) {
    case "pagesPerSheet":
      return {
        kind: "server",
        endpoint: PAGE_LAYOUT_ENDPOINT,
        request: pageLayoutToApiParams(settings.layout),
        suffix: "n-up",
      };
    case "booklet":
      return {
        kind: "server",
        endpoint: BOOKLET_ENDPOINT,
        request: bookletImpositionToApiParams(settings.booklet),
        suffix: "booklet",
      };
    case "poster":
      return {
        kind: "server",
        endpoint: POSTER_ENDPOINT,
        request: settings.poster,
        suffix: "poster",
      };
    case "standard":
    default: {
      const pages = selectionPages(settings, pageCount);
      // The engine takes closed, ascending ranges only, so a job states its
      // pages whenever parity resolves them or the text leaves an end open.
      const expand = settings.parity !== "all" || rangeHasOpenEnd(pageRange);
      const stated =
        expand && pages !== null && pages.length > 0
          ? selectionRange(pages)
          : normalizeRange(pageRange).trim();
      return {
        kind: "viewer",
        pageRange: stated || undefined,
        includeAnnotations: settings.includeAnnotations,
      };
    }
  }
}

/** Page lists the viewer's print engine takes: "1-3,5", "7", "2,4-6", "3-". */
const PAGE_RANGE =
  /^(?:\d+(?:\s*-\s*\d*)?|-\s*\d+)(?:\s*,\s*(?:\d+(?:\s*-\s*\d*)?|-\s*\d+))*$/;

/** Digits and comma glyphs a reader may type, as the engine's grammar reads them. */
const NON_ASCII_DIGITS = /[\u0660-\u0669\u06f0-\u06f9\u0966-\u096f]/g;
const NON_ASCII_COMMAS =
  /[\u060c\u066b\u066c\u2e34\u2e41\u3001\uff0c\uff64\ufe10\ufe50]/g;

function normalizeRange(range: string): string {
  return range
    .replace(NON_ASCII_DIGITS, (digit) => {
      const code = digit.codePointAt(0) ?? 0;
      const base = code >= 0x0966 ? 0x0966 : code >= 0x06f0 ? 0x06f0 : 0x0660;
      return String(code - base);
    })
    .replace(NON_ASCII_COMMAS, ",");
}

type RangePart = { from: number; to?: number; open?: boolean };

/**
 * One part per comma-separated token: "3" a single page, "3-5" a run, "3-" a
 * run that reaches the end of the document, "-3" one that starts at the first.
 * Only called on a range that has already parsed as a list of numbers.
 */
function rangeParts(range: string): RangePart[] {
  return normalizeRange(range)
    .split(",")
    .map((part) => {
      const [rawFrom, rawTo] = part.split("-").map((value) => value.trim());
      const from = rawFrom === "" ? 1 : Number(rawFrom);
      if (rawTo === undefined) {
        return { from };
      }
      return rawTo === "" ? { from, open: true } : { from, to: Number(rawTo) };
    });
}

function isPageRangeValid(pageRange: string): boolean {
  const trimmed = normalizeRange(pageRange).trim();
  if (trimmed === "") {
    return true;
  }
  if (!PAGE_RANGE.test(trimmed)) {
    return false;
  }
  return rangeParts(trimmed).every(
    (part) => part.to === undefined || part.from <= part.to,
  );
}

/** A range that runs high to low, which the engine will not read. */
function rangeRunsBackwards(pageRange: string): boolean {
  const trimmed = normalizeRange(pageRange).trim();
  if (trimmed === "" || !PAGE_RANGE.test(trimmed)) {
    return false;
  }
  return rangeParts(trimmed).some(
    (part) => part.to !== undefined && part.from > part.to,
  );
}

/** Whether a part of the range leaves its end to the document. */
function rangeHasOpenEnd(pageRange: string): boolean {
  const trimmed = normalizeRange(pageRange).trim();
  return (
    trimmed !== "" &&
    PAGE_RANGE.test(trimmed) &&
    rangeParts(trimmed).some((part) => part.open === true)
  );
}

/** The reason a range text cannot be read, or null when it can. */
function rangeProblem(pageRange: string): PrintProblem | null {
  if (isPageRangeValid(pageRange)) {
    return null;
  }
  return rangeRunsBackwards(pageRange) ? "rangeBackwards" : "invalidPageRange";
}

function isTileCountValid(tiles: number): boolean {
  return (
    Number.isInteger(tiles) &&
    tiles >= POSTER_MIN_TILES &&
    tiles <= POSTER_MAX_TILES
  );
}

/**
 * The pages a range names, in print order, clamped to the document. An empty
 * range selects every page; null means the text is not a range the engine can
 * read. Pages past the end are dropped rather than refused, as the engine
 * ignores them.
 */
export function selectedPages(
  pageRange: string,
  pageCount: number,
): number[] | null {
  const trimmed = normalizeRange(pageRange).trim();
  if (pageCount < 1) {
    return [];
  }
  if (trimmed === "") {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }
  if (!isPageRangeValid(trimmed)) {
    return null;
  }
  const pages = new Set<number>();
  for (const part of rangeParts(trimmed)) {
    const last = part.open ? pageCount : (part.to ?? part.from);
    for (let page = part.from; page <= last && page <= pageCount; page += 1) {
      if (page >= 1) {
        pages.add(page);
      }
    }
  }
  return [...pages].sort((a, b) => a - b);
}

export function parityPages(pages: number[], parity: PageParity): number[] {
  if (parity === "all") {
    return pages;
  }
  return pages.filter((page) =>
    parity === "odd" ? page % 2 === 1 : page % 2 === 0,
  );
}

/** The pages the standard preset prints: the range with the parity filter applied. */
export function selectionPages(
  settings: PrintSettings,
  pageCount: number,
): number[] | null {
  const pages = selectedPages(settings.pageRange, pageCount);
  return pages === null ? null : parityPages(pages, settings.parity);
}

/**
 * A page list as the engine's range grammar, with consecutive pages compacted
 * so a long run stays one token: [1, 2, 3, 5] becomes "1-3, 5".
 */
export function selectionRange(pages: number[]): string {
  const tokens: string[] = [];
  let index = 0;
  while (index < pages.length) {
    let end = index;
    while (end + 1 < pages.length && pages[end + 1] === pages[end] + 1) {
      end += 1;
    }
    tokens.push(
      end === index ? String(pages[index]) : `${pages[index]}-${pages[end]}`,
    );
    index = end + 1;
  }
  return tokens.join(", ");
}

export interface PrintSummaryLine {
  key: string;
  values: Record<string, number | string>;
}

/** How many document pages one output side carries. */
export function pagesPerSheet(layout: PageLayoutParameters): number {
  return layout.mode === "CUSTOM"
    ? layout.rows * layout.cols
    : layout.pagesPerSheet;
}

export type BookletPass = "both" | "fronts" | "backs";

/**
 * Which sides the booklet settings prepare. Both sides and the two manual
 * passes are different jobs, so callers name the one these settings produce
 * rather than leaving the pass to be inferred.
 */
export function bookletPass(booklet: BookletImpositionParameters): BookletPass {
  if (booklet.doubleSided) {
    return "both";
  }
  return booklet.duplexPass === "SECOND" ? "backs" : "fronts";
}

function bookletOutputKey(booklet: BookletImpositionParameters): string {
  switch (bookletPass(booklet)) {
    case "both":
      return "viewer.print.summaryBookletBothSides";
    case "fronts":
      return "viewer.print.summaryBookletFronts";
    case "backs":
      return "viewer.print.summaryBookletBacks";
  }
}

/** The two pages one side of a folded sheet carries, left then right. */
export type BookletSide = [number, number];

/**
 * The pages each side of a folded sheet prints, in the order the imposition
 * lays them down: the first side carries the last page beside the first,
 * because folding the stack in half brings those two together.
 *
 * The count is padded to a multiple of four, so a page number past the document
 * is a blank the imposition inserts rather than a page to render.
 */
export function bookletSides(
  pageCount: number,
  spineLocation: BookletImpositionParameters["spineLocation"],
): BookletSide[] {
  if (pageCount < 1) {
    return [];
  }
  const padded = Math.ceil(pageCount / 4) * 4;
  const sides: BookletSide[] = [];
  for (let sheet = 1; sheet <= padded / 4; sheet += 1) {
    const front: BookletSide = [padded - 2 * (sheet - 1), 2 * sheet - 1];
    const back: BookletSide = [2 * sheet, padded - 2 * sheet + 1];
    sides.push(
      spineLocation === "RIGHT" ? [front[1], front[0]] : front,
      spineLocation === "RIGHT" ? [back[1], back[0]] : back,
    );
  }
  return sides;
}

/** 1-based side of the imposition that holds a page, or 1 when it holds none. */
export function bookletSideIndex(sides: BookletSide[], page: number): number {
  const index = sides.findIndex((side) => side[0] === page || side[1] === page);
  return index < 0 ? 1 : index + 1;
}

/**
 * What the job will produce, so a layout that rearranges the document says what
 * it makes before it runs. Pages are the document's and output sides are the
 * file's: whether they land on one physical sheet is duplex, which the printer
 * dialog decides, so no physical sheet count is claimed here. Null when there
 * is nothing to count, which is also when the dialog shows a problem instead.
 */
export function printSummary(
  settings: PrintSettings,
  pageCount: number,
): PrintSummaryLine[] | null {
  if (pageCount < 1) {
    return null;
  }
  switch (settings.preset) {
    case "pagesPerSheet": {
      const perSheet = pagesPerSheet(settings.layout);
      if (perSheet < 1) {
        return null;
      }
      // The side count drives the plural, so a single-sheet job reads "1 output
      // side" rather than agreeing with the page count.
      const sides = Math.ceil(pageCount / perSheet);
      return [
        {
          key: "viewer.print.summaryPagesPerSheet",
          values: { pages: pageCount, sides, count: sides },
        },
        {
          key: "viewer.print.summaryPerSide",
          values: { perSheet, count: perSheet },
        },
      ];
    }
    case "booklet": {
      // A booklet is four pages to a folded sheet and the backend pads the count
      // to match, so the difference is blanks it inserts, not document pages.
      const blanks = Math.ceil(pageCount / 4) * 4 - pageCount;
      // The padded count and its blanks are one fact, so the page count joins
      // the blanks line rather than standing alone above it.
      const pagination: PrintSummaryLine =
        blanks > 0
          ? {
              key: "viewer.print.summaryBookletBlanks",
              values: { pages: pageCount, blanks, count: blanks },
            }
          : {
              key: "viewer.print.summaryBookletPages",
              values: { pages: pageCount },
            };
      return [
        pagination,
        { key: bookletOutputKey(settings.booklet), values: {} },
      ];
    }
    case "poster": {
      const { xFactor, yFactor } = settings.poster;
      if (!isTileCountValid(xFactor) || !isTileCountValid(yFactor)) {
        return null;
      }
      // The grid divides every page, so the tile total spans the document.
      const tiles = pageCount * xFactor * yFactor;
      const lines: PrintSummaryLine[] = [
        {
          key: "viewer.print.summaryPosterTiles",
          values: { pages: pageCount, tiles, count: tiles },
        },
        {
          key: "viewer.print.summaryPosterGrid",
          values: {
            columns: xFactor,
            rows: yFactor,
            paper: settings.poster.pageSize,
          },
        },
      ];
      // A zero overhang changes nothing a reader would sense, so it names none.
      if (settings.poster.overlap > 0) {
        lines.push({
          key: "viewer.print.summaryPosterOverhang",
          values: { count: settings.poster.overlap },
        });
      }
      return lines;
    }
    case "standard":
    default:
      return null;
  }
}

/** Why the chosen settings cannot run yet, as an i18n key. */
export type PrintProblem =
  | "emptyPageRange"
  | "invalidLayout"
  | "invalidOverhang"
  | "invalidPageRange"
  | "invalidTiles"
  | "rangeBackwards";

/**
 * Whether the range names pages past the end of the document. The engine drops
 * those pages, so the dialog says a reduced selection is a reduced selection
 * instead of letting the count pass for what was asked for.
 */
export function rangeIsClipped(pageRange: string, pageCount: number): boolean {
  const trimmed = normalizeRange(pageRange).trim();
  if (trimmed === "" || !isPageRangeValid(trimmed)) {
    return false;
  }
  return rangeParts(trimmed).some((part) =>
    part.to === undefined
      ? part.from > pageCount
      : Math.max(part.from, part.to) > pageCount,
  );
}

/**
 * The one reason these settings cannot print, or null when they can. The dialog
 * shows it beside the fields so a disabled button always states its fix.
 *
 * The page count is what tells an empty selection from a range the viewer can
 * apply: without it a range that names no existing page is only syntactically
 * checked, which is all the dialog can do before the document arrives.
 */
export function printProblem(
  settings: PrintSettings,
  pageCount?: number,
): PrintProblem | null {
  switch (settings.preset) {
    case "pagesPerSheet":
      return validatePageLayoutParameters(settings.layout)
        ? null
        : "invalidLayout";
    case "booklet":
      return validateBookletImpositionParameters(settings.booklet)
        ? null
        : "invalidLayout";
    case "poster":
      return isTileCountValid(settings.poster.xFactor) &&
        isTileCountValid(settings.poster.yFactor)
        ? isOverhangValid(settings.poster.overlap)
          ? null
          : "invalidOverhang"
        : "invalidTiles";
    case "standard":
    default: {
      if (pageCount === undefined || pageCount < 1) {
        return rangeProblem(settings.pageRange);
      }
      const pages = selectionPages(settings, pageCount);
      if (pages === null) {
        return rangeProblem(settings.pageRange) ?? "invalidPageRange";
      }
      return pages.length === 0 ? "emptyPageRange" : null;
    }
  }
}

/** Keeps the printed copy recognisable next to the original in the print queue. */
export function printFileName(fileName: string, suffix?: string): string {
  const pdfName = /\.pdf$/i.test(fileName) ? fileName : `${fileName}.pdf`;
  return suffix ? pdfName.replace(/\.pdf$/i, ` - ${suffix}.pdf`) : pdfName;
}
