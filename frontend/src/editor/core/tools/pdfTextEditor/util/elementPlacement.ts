/**
 * Where an element added for untagged content goes in the reading order:
 * after the tagged content closest before it as the page displays it, read
 * top to bottom and then left to right. The content order cannot say this: an
 * inserted image is drawn last whatever its position on the page.
 */
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import { innermostMcid } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";
import type { PageRect } from "@editor/tools/pdfTextEditor/types";

/** Tops this close (points) read as one line. */
const SAME_LINE = 2;

interface Box {
  left: number;
  right: number;
  top: number;
}

/** Page-level content with an MCID, and where it is drawn. */
export interface TaggedContent {
  mcid: number;
  bounds: PageRect;
}

/**
 * The MCID of the tagged content read last before `target`, or null when none
 * precedes it. Content in the target's column wins over content beside it, so
 * an element under a paragraph follows that paragraph and not the one across
 * the gutter.
 */
export function precedingTaggedMcid(
  page: Page,
  target: TaggedContent,
): number | null {
  const box = displayBox(page, target.bounds);
  const before = taggedContent(page)
    .filter((c) => c.mcid !== target.mcid)
    .map((c) => ({ mcid: c.mcid, box: displayBox(page, c.bounds) }))
    .filter((c) => readsBefore(c.box, box));
  const inColumn = before.filter(
    (c) => c.box.left < box.right && c.box.right > box.left,
  );
  const pool = inColumn.length > 0 ? inColumn : before;
  let last: (typeof pool)[number] | null = null;
  for (const content of pool) {
    if (!last || readsBefore(last.box, content.box)) last = content;
  }
  return last?.mcid ?? null;
}

/** The page's tagged content, text and images alike, top to bottom then left to right. */
export function taggedContentInReadingOrder(page: Page): TaggedContent[] {
  return taggedContent(page)
    .map((content) => ({ content, box: displayBox(page, content.bounds) }))
    .sort((a, b) => readingOrder(a.box, b.box))
    .map(({ content }) => content);
}

function taggedContent(page: Page): TaggedContent[] {
  const content: TaggedContent[] = [];
  for (const run of page.runs) {
    const mcid = innermostMcid(run.tagMarks);
    if (mcid !== null) content.push({ mcid, bounds: run.bounds });
  }
  for (const image of page.images) {
    if (image.mcid === null || image.containerPtr !== 0) continue;
    content.push({ mcid: image.mcid, bounds: image.bounds });
  }
  return content;
}

function readsBefore(a: Box, b: Box): boolean {
  if (Math.abs(a.top - b.top) > SAME_LINE) return a.top > b.top;
  return a.left < b.left;
}

function readingOrder(a: Box, b: Box): number {
  if (readsBefore(a, b)) return -1;
  if (readsBefore(b, a)) return 1;
  return 0;
}

/** The rect's bounds as displayed, y-up, so a /Rotate page reads as it is shown. */
function displayBox(page: Page, rect: PageRect): Box {
  const corners = [
    page.display.apply(rect.x, rect.y),
    page.display.apply(rect.x + rect.width, rect.y),
    page.display.apply(rect.x, rect.y + rect.height),
    page.display.apply(rect.x + rect.width, rect.y + rect.height),
  ];
  const xs = corners.map((c) => c.x);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.max(...corners.map((c) => c.y)),
  };
}
