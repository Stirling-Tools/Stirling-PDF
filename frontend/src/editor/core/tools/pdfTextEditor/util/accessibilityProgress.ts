import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type {
  PageRect,
  PageSnapshot,
  TextRunSnapshot,
} from "@editor/tools/pdfTextEditor/types";
import { describableTextBlock } from "@editor/tools/pdfTextEditor/util/accessibilityReview";
import {
  textTag,
  type TextTag,
} from "@editor/tools/pdfTextEditor/util/textAccessibility";
import {
  attentionFor,
  imageAccessibility,
  type ImageAccessibility,
} from "@editor/tools/pdfTextEditor/util/imageAccessibility";

/** Where an item stands for a screen reader. */
export type ReviewStatus = "done" | "todo";

/** A block of text or an image that a screen reader has to be told about. */
export interface ReviewItem {
  kind: "text" | "image";
  id: string;
  pageIndex: number;
  bounds: PageRect;
  status: ReviewStatus;
}

export interface AccessibilityProgress {
  /** In page order, then top to bottom. */
  items: ReviewItem[];
  done: number;
  total: number;
  /** False while some pages are unread, so the counts are still growing. */
  complete: boolean;
}

/**
 * Text is done once tagged or skipped. Text the editor cannot tag is left out, or
 * the score would stay short with nothing the user can do.
 */
export function textStatus(tag: TextTag): ReviewStatus | null {
  switch (tag.kind) {
    case "tagged":
    case "artifact":
      return "done";
    case "untagged":
      return tag.taggable ? "todo" : null;
    default:
      return null;
  }
}

/** An image is done once described or marked decorative; blocked images are left out. */
export function imageStatus(
  accessibility: ImageAccessibility,
): ReviewStatus | null {
  if (accessibility.kind === "blocked") return null;
  return attentionFor(accessibility) === null ? "done" : "todo";
}

/** A figure or formula drawn as text is done only once described, as an image is. */
function runStatus(
  doc: EditorDocument,
  run: TextRunSnapshot,
): ReviewStatus | null {
  const status = textStatus(textTag(doc, run));
  if (status !== "done" || !describableTextBlock(doc, run)) return status;
  return doc.structure(run.pageIndex).alt(run.mcid!)?.trim() ? "done" : "todo";
}

export function reviewItems(
  doc: EditorDocument,
  pages: readonly PageSnapshot[],
): ReviewItem[] {
  return pages.flatMap((page) => {
    const items: ReviewItem[] = [];
    for (const run of page.runs) {
      const status = runStatus(doc, run);
      if (status) items.push(item("text", run, status));
    }
    for (const image of page.images) {
      const status = imageStatus(imageAccessibility(doc, image));
      if (status) items.push(item("image", image, status));
    }
    return items.sort(readingOrder);
  });
}

export function accessibilityProgress(
  doc: EditorDocument,
  pages: readonly PageSnapshot[],
): AccessibilityProgress {
  const items = reviewItems(doc, pages);
  return {
    items,
    done: items.filter((i) => i.status === "done").length,
    total: items.length,
    complete: pages.every((p) => doc.page(p.pageIndex).loaded),
  };
}

/**
 * The first item still to do after `currentId`, wrapping round (from the start when
 * it is null or absent). Null once every item is done.
 */
export function nextTodo(
  items: readonly ReviewItem[],
  currentId: string | null,
): ReviewItem | null {
  const start = items.findIndex((i) => i.id === currentId) + 1;
  for (let n = 0; n < items.length; n++) {
    const candidate = items[(start + n) % items.length];
    if (candidate.status === "todo" && candidate.id !== currentId)
      return candidate;
  }
  return null;
}

/** The first item still to do before `currentId`, wrapping round to the end; from the end when `currentId` is null or not in `items`. */
export function previousTodo(
  items: readonly ReviewItem[],
  currentId: string | null,
): ReviewItem | null {
  const at = items.findIndex((i) => i.id === currentId);
  const start = at === -1 ? items.length : at;
  for (let n = 1; n <= items.length; n++) {
    const candidate = items[(start - n + items.length) % items.length];
    if (candidate.status === "todo" && candidate.id !== currentId)
      return candidate;
  }
  return null;
}

function item(
  kind: ReviewItem["kind"],
  object: { id: string; pageIndex: number; bounds: PageRect },
  status: ReviewStatus,
): ReviewItem {
  return {
    kind,
    id: object.id,
    pageIndex: object.pageIndex,
    bounds: object.bounds,
    status,
  };
}

// PDF space puts y=0 at the bottom, so the higher top edge reads first.
function readingOrder(a: ReviewItem, b: ReviewItem): number {
  const topA = a.bounds.y + a.bounds.height;
  const topB = b.bounds.y + b.bounds.height;
  if (Math.abs(topA - topB) > 1) return topB - topA;
  return a.bounds.x - b.bounds.x;
}
