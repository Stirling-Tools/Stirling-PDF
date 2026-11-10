/**
 * Recognising page furniture: what a document repeats on its pages, such as
 * running headers, page numbers and watermarks. Text is compared with
 * each run of digits, in any script, read as one, so "Page 3" matches
 * "Page 12", and height as the distance from the page's nearer edge, as
 * displayed, so pages of different sizes still line up.
 */
import type { Furniture } from "@editor/tools/pdfTextEditor/model/artifactKind";
import type { DisplayTransformData } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import type { Affine, PageRect, RGBA } from "@editor/tools/pdfTextEditor/types";

/** How far apart two runs can sit, in points, and still be at the same height or in the same place. */
const SAME_HEIGHT_PT = 4;
/** How near an edge, as a share of the page's height, auto-tag looks for furniture. */
const EDGE_BAND = 0.12;
/**
 * How many copies of one thing a page draws, spread over at least half its
 * width and half its height, to be tiled with it: a form's repeated labels
 * rarely spread so far, and the watermark tool's grid always covers the page.
 */
const TILED = 3;
/** How far from square to the page, in radians, a run must be turned to read as set at an angle. */
const OFF_AXIS = 0.05;
const DIGITS = /\p{Nd}+/gu;
const DIGIT = /^\p{Nd}$/u;

export interface FurnitureRun {
  id: string;
  text: string;
  bounds: PageRect;
  matrix: Affine;
  fill: RGBA;
}

export interface FurnitureImage {
  id: string;
  bounds: PageRect;
  matrix: Affine;
}

export interface FurniturePage<R extends FurnitureRun = FurnitureRun> {
  pageIndex: number;
  display: DisplayTransformData;
  runs: readonly R[];
  images?: readonly FurnitureImage[];
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
 * What auto-tag should mark as furniture rather than give an element, by
 * page index and then run or image id. Watermarks come first: text or images
 * drawn in the same place on at least half the document's pages that are
 * tiled across the page, set at an angle, or (text) see-through, and that
 * repeat on two pages or tile one. Then text near the top or bottom of a
 * page that at least half the pages, and at least two, show at the same
 * height: near the top a header, near the bottom a footer, and either a page
 * number when one of its numbers counts up with the pages, whatever words
 * surround it. `pageCount` counts the pages not in `pages` too.
 */
export function recogniseFurniture(
  pages: readonly FurniturePage[],
  pageCount: number,
): Map<number, Map<string, Furniture>> {
  const half = Math.ceil(pageCount / 2);
  const furniture = new Map<number, Map<string, Furniture>>();
  const mark = (pageIndex: number, id: string, kind: Furniture) => {
    const onPage = furniture.get(pageIndex) ?? new Map<string, Furniture>();
    furniture.set(pageIndex, onPage.set(id, kind));
  };
  for (const { pageIndex, id } of watermarks(pages, half)) {
    mark(pageIndex, id, "Watermark");
  }

  const groups = new Map<string, { at: Placement; runs: GroupedRun[] }[]>();
  for (const page of pages) {
    for (const run of page.runs) {
      if (furniture.get(page.pageIndex)?.has(run.id)) continue;
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

  const needed = Math.max(2, half);
  for (const sameText of groups.values()) {
    for (const { at, runs } of sameText) {
      if (pagesOf(runs) < needed) continue;
      const kind = furnitureKind(runs, at.edge);
      for (const { pageIndex, id } of runs) mark(pageIndex, id, kind);
    }
  }
  return furniture;
}

/** Something a page draws that may be a watermark, keyed by what it shows. */
interface Drawn {
  pageIndex: number;
  id: string;
  key: string;
  centre: { x: number; y: number };
  tiled: boolean;
}

/** The text and images `recogniseFurniture` reads as watermarks. */
function watermarks(
  pages: readonly FurniturePage[],
  half: number,
): { pageIndex: number; id: string }[] {
  const groups = new Map<string, Drawn[][]>();
  for (const drawn of pages.flatMap(watermarkLike)) {
    const sameKey = groups.get(drawn.key) ?? [];
    groups.set(drawn.key, sameKey);
    const group = sameKey.find((g) => samePlace(g[0].centre, drawn.centre));
    if (group) group.push(drawn);
    else sameKey.push([drawn]);
  }
  return [...groups.values()].flat().flatMap((group) => {
    const pages = pagesOf(group);
    const repeats = pages >= 2 || group.some((drawn) => drawn.tiled);
    return pages >= half && repeats ? group : [];
  });
}

/** What the page draws that looks like a watermark: tiled, set at an angle, or see-through. */
function watermarkLike(page: FurniturePage): Drawn[] {
  const items = [
    ...page.runs.map((run) => ({
      id: run.id,
      key: furnitureText(run.text) && `text:${furnitureText(run.text)}`,
      bounds: run.bounds,
      matrix: run.matrix,
      seeThrough: run.fill.a < 255,
    })),
    ...(page.images ?? []).map((image) => ({
      id: image.id,
      key: `image:${Math.round(image.bounds.width)}x${Math.round(image.bounds.height)}`,
      bounds: image.bounds,
      matrix: image.matrix,
      // PDFium reads no fill for an image, so its opacity is unknown.
      seeThrough: false,
    })),
  ].filter((item) => item.key);
  const centres = new Map<string, { x: number; y: number }[]>();
  const placed = items.map((item) => {
    const at = centre(page.display, item.bounds);
    centres.set(item.key, [...(centres.get(item.key) ?? []), at]);
    return { ...item, at };
  });
  return placed.flatMap((item) => {
    const tiled = tiles(centres.get(item.key)!, page.display);
    if (!tiled && !item.seeThrough && !offAxis(item.matrix)) return [];
    return [
      {
        pageIndex: page.pageIndex,
        id: item.id,
        key: item.key,
        centre: item.at,
        tiled,
      },
    ];
  });
}

/** True when copies at `centres` tile the page (see TILED). */
function tiles(
  centres: readonly { x: number; y: number }[],
  { displayWidth, displayHeight }: DisplayTransformData,
): boolean {
  if (centres.length < TILED) return false;
  const span = (values: number[]) => Math.max(...values) - Math.min(...values);
  return (
    span(centres.map((c) => c.x)) >= displayWidth / 2 &&
    span(centres.map((c) => c.y)) >= displayHeight / 2
  );
}

function pagesOf(items: readonly { pageIndex: number }[]): number {
  return new Set(items.map((item) => item.pageIndex)).size;
}

/** True when the matrix turns its content by other than a multiple of a right angle. */
function offAxis({ a, b }: Affine): boolean {
  const turn = Math.abs(Math.atan2(b, a)) % (Math.PI / 2);
  return turn > OFF_AXIS && turn < Math.PI / 2 - OFF_AXIS;
}

function samePlace(
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  return (
    Math.abs(a.x - b.x) <= SAME_HEIGHT_PT &&
    Math.abs(a.y - b.y) <= SAME_HEIGHT_PT
  );
}

/** The middle of `bounds` on its page as displayed. */
function centre(
  display: DisplayTransformData,
  { x, y, width, height }: PageRect,
): { x: number; y: number } {
  const px = x + width / 2;
  const py = y + height / 2;
  return {
    x: display.a * px + display.c * py + display.e,
    y: display.b * px + display.d * py + display.f,
  };
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
