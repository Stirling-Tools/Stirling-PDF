/**
 * Recognising page furniture: text a document repeats at the same height on
 * its pages, such as running headers and page numbers. Text is compared with
 * each run of digits read as one, so "Page 3" matches "Page 12", and height
 * as the distance from the page's nearer edge, as displayed, so pages of
 * different sizes still line up.
 */
import type { Furniture } from "@editor/tools/pdfTextEditor/model/artifactKind";
import type { DisplayTransformData } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import type { PageRect } from "@editor/tools/pdfTextEditor/types";

/** How far apart two runs can sit, in points, and still be at the same height. */
const SAME_HEIGHT_PT = 4;
/** How near an edge, as a share of the page's height, auto-tag looks for furniture. */
const EDGE_BAND = 0.12;
/** "3", "Page 3", "3 of 10", "3/10", "- 3 -", with digits already read as "#". */
const PAGE_NUMBER =
  /^(?:(?:page\s*)?#(?:\s*(?:of|\/)\s*#)?|[-\u2013\u2014]\s*#\s*[-\u2013\u2014])$/i;

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
  return text.replace(/\s+/g, " ").trim().replace(/\d+/g, "#");
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
 * is a page number when it reads like one. `pageCount` counts the pages
 * not in `pages` too.
 */
export function recogniseFurniture(
  pages: readonly FurniturePage[],
  pageCount: number,
): Map<number, Map<string, Furniture>> {
  const groups = new Map<
    string,
    { at: Placement; runs: { pageIndex: number; id: string }[] }[]
  >();
  for (const page of pages) {
    for (const run of page.runs) {
      const at = placement(page.display, run.bounds);
      const text = furnitureText(run.text);
      if (!text || at.share > EDGE_BAND) continue;
      const key = `${at.edge}:${text}`;
      const sameText = groups.get(key) ?? [];
      groups.set(key, sameText);
      const group = sameText.find((g) => sameHeight(g.at, at));
      if (group) group.runs.push({ pageIndex: page.pageIndex, id: run.id });
      else
        sameText.push({
          at,
          runs: [{ pageIndex: page.pageIndex, id: run.id }],
        });
    }
  }

  const needed = Math.max(2, Math.ceil(pageCount / 2));
  const furniture = new Map<number, Map<string, Furniture>>();
  for (const [key, sameText] of groups) {
    const text = key.slice(key.indexOf(":") + 1);
    for (const { at, runs } of sameText) {
      if (new Set(runs.map((r) => r.pageIndex)).size < needed) continue;
      const kind = furnitureKind(text, at.edge);
      for (const { pageIndex, id } of runs) {
        const onPage = furniture.get(pageIndex) ?? new Map<string, Furniture>();
        furniture.set(pageIndex, onPage.set(id, kind));
      }
    }
  }
  return furniture;
}

function furnitureKind(text: string, edge: Placement["edge"]): Furniture {
  if (PAGE_NUMBER.test(text)) return "PageNum";
  return edge === "top" ? "Header" : "Footer";
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
