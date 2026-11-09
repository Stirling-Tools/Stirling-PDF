/**
 * Recognising page furniture: text a document repeats at the same height on
 * its pages, such as running headers and page numbers. Text is compared with
 * each run of digits, in any script, read as one, so "Page 3" matches
 * "Page 12", and height as the distance from the page's nearer edge, as
 * displayed, so pages of different sizes still line up.
 */
import type { Furniture } from "@editor/tools/pdfTextEditor/model/artifactKind";
import type { DisplayTransformData } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import type { PageRect } from "@editor/tools/pdfTextEditor/types";

/** How far apart two runs can sit, in points, and still be at the same height. */
const SAME_HEIGHT_PT = 4;
/** How near an edge, as a share of the page's height, auto-tag looks for furniture. */
const EDGE_BAND = 0.12;
const DIGITS = /\p{Nd}+/gu;
const DIGIT = /^\p{Nd}$/u;

export interface FurnitureRun {
  id: string;
  text: string;
  bounds: PageRect;
}

export interface FurniturePage<R extends FurnitureRun = FurnitureRun> {
  pageIndex: number;
  display: DisplayTransformData;
  runs: readonly R[];
}

interface Placement {
  edge: "top" | "bottom";
  /** From that edge to the nearer side of the run, in points. */
  distance: number;
  /** As a share of the page's height. */
  share: number;
}

/** The text as furniture compares it: whitespace collapsed, each run of digits one "#". */
export function furnitureText(text: string): string {
  return text.replace(/\s+/g, " ").trim().replace(DIGITS, "#");
}

/**
 * The runs on pages other than `pageIndex` that show `run`'s text, digits
 * aside, at its height, with the page each is on.
 */
export function matchingRuns<R extends FurnitureRun>(
  pages: readonly FurniturePage<R>[],
  pageIndex: number,
  run: FurnitureRun,
): { pageIndex: number; run: R }[] {
  const own = pages.find((page) => page.pageIndex === pageIndex);
  const text = furnitureText(run.text);
  if (!own || !text) return [];
  const at = placement(own.display, run.bounds);
  return pages.flatMap((page) =>
    page.pageIndex === pageIndex
      ? []
      : page.runs
          .filter(
            (other) =>
              furnitureText(other.text) === text &&
              sameHeight(at, placement(page.display, other.bounds)),
          )
          .map((other) => ({ pageIndex: page.pageIndex, run: other })),
  );
}

/**
 * The runs auto-tag should mark as furniture rather than give an element,
 * by page index and then run id: text near the top or bottom of a page that
 * at least half the document's pages, and at least two, show at the same
 * height. Near the top it is a header, near the bottom a footer, and either
 * is a page number when one of its numbers counts up with the pages, whatever
 * words surround it. `pageCount` counts the pages not in `pages` too.
 */
export function recogniseFurniture(
  pages: readonly FurniturePage[],
  pageCount: number,
): Map<number, Map<string, Furniture>> {
  const groups = new Map<string, { at: Placement; runs: GroupedRun[] }[]>();
  for (const page of pages) {
    for (const run of page.runs) {
      const at = placement(page.display, run.bounds);
      const text = furnitureText(run.text);
      if (!text || at.share > EDGE_BAND) continue;
      const key = `${at.edge}:${text}`;
      const sameText = groups.get(key) ?? [];
      groups.set(key, sameText);
      const grouped = {
        pageIndex: page.pageIndex,
        id: run.id,
        numbers: numbers(run.text),
      };
      const group = sameText.find((g) => sameHeight(g.at, at));
      if (group) group.runs.push(grouped);
      else sameText.push({ at, runs: [grouped] });
    }
  }

  const needed = Math.max(2, Math.ceil(pageCount / 2));
  const furniture = new Map<number, Map<string, Furniture>>();
  for (const sameText of groups.values()) {
    for (const { at, runs } of sameText) {
      if (new Set(runs.map((r) => r.pageIndex)).size < needed) continue;
      const kind = furnitureKind(runs, at.edge);
      for (const { pageIndex, id } of runs) {
        const onPage = furniture.get(pageIndex) ?? new Map<string, Furniture>();
        furniture.set(pageIndex, onPage.set(id, kind));
      }
    }
  }
  return furniture;
}

interface GroupedRun {
  pageIndex: number;
  id: string;
  numbers: number[];
}

function furnitureKind(
  runs: readonly GroupedRun[],
  edge: Placement["edge"],
): Furniture {
  if (numbersPages(runs)) return "PageNum";
  return edge === "top" ? "Header" : "Footer";
}

/**
 * True when one of the runs' numbers, at the same place in each, is its
 * page's index plus the same offset on every page: a page number, counting
 * from wherever the document starts. The runs share their text digits
 * aside, so each has as many numbers.
 */
function numbersPages(runs: readonly GroupedRun[]): boolean {
  return runs[0].numbers.some(
    (_, i) =>
      new Set(runs.map((run) => run.numbers[i] - run.pageIndex)).size === 1,
  );
}

/** The text's numbers, written in the digits of any script. */
function numbers(text: string): number[] {
  return [...text.matchAll(DIGITS)].map(([digits]) =>
    [...digits].reduce((value, digit) => value * 10 + digitValue(digit), 0),
  );
}

/**
 * A decimal digit's value. Unicode encodes every script's decimal digits as
 * a contiguous run of ten, zero to nine, so the value is how far into its
 * run the digit sits; runs that abut, such as the mathematical digits, each
 * begin ten after the last.
 */
function digitValue(digit: string): number {
  const code = digit.codePointAt(0)!;
  let below = 0;
  while (DIGIT.test(String.fromCodePoint(code - below - 1))) below++;
  return below % 10;
}

function sameHeight(a: Placement, b: Placement): boolean {
  return (
    a.edge === b.edge && Math.abs(a.distance - b.distance) <= SAME_HEIGHT_PT
  );
}

/** Where the run sits on its page as displayed, by the page's nearer edge. */
function placement(display: DisplayTransformData, bounds: PageRect): Placement {
  const { x, y, width, height } = bounds;
  const ys = [
    [x, y],
    [x + width, y],
    [x, y + height],
    [x + width, y + height],
  ].map(([px, py]) => display.b * px + display.d * py + display.f);
  const fromBottom = Math.min(...ys);
  const fromTop = display.displayHeight - Math.max(...ys);
  const edge = fromTop <= fromBottom ? "top" : "bottom";
  const distance = Math.max(0, Math.min(fromTop, fromBottom));
  return { edge, distance, share: distance / display.displayHeight };
}
