/**
 * Where a figure added for an untagged image goes in the reading order: after
 * the tagged content closest before the image as the page displays it, read
 * top to bottom and then left to right. The content order cannot say this: an
 * inserted image is drawn last whatever its position on the page.
 */
import type { ImageObject } from "@editor/tools/pdfTextEditor/model/ImageObject";
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

interface TaggedContent {
  mcid: number;
  box: Box;
}

/**
 * The MCID of the tagged content read last before `image`, or null when none
 * precedes it. Content in the image's column wins over content beside it, so
 * a figure under a paragraph follows that paragraph and not the one across
 * the gutter.
 */
export function precedingTaggedMcid(
  page: Page,
  image: ImageObject,
): number | null {
  const target = displayBox(page, image.bounds);
  const before = taggedContent(page, image).filter((c) =>
    readsBefore(c.box, target),
  );
  const inColumn = before.filter(
    (c) => c.box.left < target.right && c.box.right > target.left,
  );
  const pool = inColumn.length > 0 ? inColumn : before;
  let last: TaggedContent | null = null;
  for (const content of pool) {
    if (!last || readsBefore(last.box, content.box)) last = content;
  }
  return last?.mcid ?? null;
}

export function imagesInReadingOrder(page: Page): ImageObject[] {
  return page.images
    .map((image) => ({ image, box: displayBox(page, image.bounds) }))
    .sort((a, b) => readingOrder(a.box, b.box))
    .map(({ image }) => image);
}

function taggedContent(page: Page, except: ImageObject): TaggedContent[] {
  const content: TaggedContent[] = [];
  for (const run of page.runs) {
    const mcid = innermostMcid(run.tagMarks);
    if (mcid !== null)
      content.push({ mcid, box: displayBox(page, run.bounds) });
  }
  for (const image of page.images) {
    if (image === except || image.mcid === null || image.containerPtr !== 0) {
      continue;
    }
    content.push({ mcid: image.mcid, box: displayBox(page, image.bounds) });
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
