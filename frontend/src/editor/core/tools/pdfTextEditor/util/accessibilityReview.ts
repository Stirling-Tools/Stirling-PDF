import { DisplayTransform } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { DescribableType } from "@editor/tools/pdfTextEditor/model/PageStructure";
import type {
  PageRect,
  PageSnapshot,
  TextRunSnapshot,
} from "@editor/tools/pdfTextEditor/types";
import {
  imageAttention,
  isActionable,
  type ImageAttention,
} from "@editor/tools/pdfTextEditor/util/imageAccessibility";

/**
 * One identity for block `key` on page `pageIndex` across the document. A
 * file block's key is already unique to the file; a block the session added
 * is keyed by its MCID, which other pages reuse, so it is scoped to its page.
 */
export function documentBlockId(
  doc: EditorDocument,
  pageIndex: number,
  key: string,
): string {
  return doc.structure(pageIndex).addedBlockMcid(key) === null
    ? key
    : `${pageIndex}/${key}`;
}

/**
 * The figure or formula block a run's text belongs to, by block key, when it
 * can take a description here; null for any other text.
 */
export function describableTextBlock(
  doc: EditorDocument,
  run: TextRunSnapshot,
): { key: string; type: DescribableType } | null {
  if (run.mcid === undefined || run.inForm) return null;
  const structure = doc.structure(run.pageIndex);
  const type = structure.describableType(run.mcid);
  const block = structure.block(run.mcid);
  if (
    !type ||
    !block ||
    structure.cannotDescribe(run.mcid) !== null ||
    structure.decorative(run.mcid)
  ) {
    return null;
  }
  return { key: block.key, type };
}

/**
 * Why each image and run on a page needs the user's attention. Text is
 * flagged on the first run of a figure or formula with no description, so an
 * element drawn as several runs counts once, and not at all when one of its
 * images already carries the flag.
 */
export interface PageAttention {
  images: Map<string, ImageAttention>;
  runs: Map<string, "needs-description">;
}

export function pageAttention(
  doc: EditorDocument,
  page: PageSnapshot,
): PageAttention {
  const images = new Map<string, ImageAttention>();
  const seen = new Set<string>();
  // Read only for content that may need it: a page with none never opens it.
  const structure = () => doc.structure(page.pageIndex);
  for (const image of page.images) {
    const attention = imageAttention(doc, image);
    if (!attention) continue;
    images.set(image.id, attention);
    const block =
      image.mcid === undefined ? null : structure().block(image.mcid);
    if (block) seen.add(block.key);
  }
  const runs = new Map<string, "needs-description">();
  for (const run of page.runs) {
    const describable = describableTextBlock(doc, run);
    if (!describable || seen.has(describable.key)) continue;
    seen.add(describable.key);
    if (!structure().alt(run.mcid!)?.trim()) {
      runs.set(run.id, "needs-description");
    }
  }
  return { images, runs };
}

/** Images and text needing attention, by reason. */
export interface AccessibilityReview {
  needsDescription: number;
  untagged: number;
  untaggable: number;
}

/** Covers only the pages in `pages` that have been read. */
export function reviewAccessibility(
  doc: EditorDocument,
  pages: readonly PageSnapshot[],
): AccessibilityReview {
  const review: AccessibilityReview = {
    needsDescription: 0,
    untagged: 0,
    untaggable: 0,
  };
  // A block spanning pages is flagged on each, but one description clears it.
  const counted = new Set<string>();
  for (const page of pages) {
    for (const item of pageItems(doc, page)) {
      if (!item.attention) continue;
      if (item.block !== null && item.attention === "needs-description") {
        if (counted.has(item.block)) continue;
        counted.add(item.block);
      }
      if (item.attention === "needs-description") review.needsDescription++;
      if (item.attention === "untagged") review.untagged++;
      if (item.attention === "untaggable") review.untaggable++;
    }
  }
  return review;
}

/** An image or run the user can resolve, which Next selects. */
export interface ReviewTarget {
  kind: "image" | "text";
  id: string;
  pageIndex: number;
}

/**
 * The first target after `currentId`, in page order and then top to bottom,
 * wrapping round to the start. `currentId` may name any image or run; one not
 * on the read pages (or null) starts from the first. A block is visited once,
 * at its first flag, and the block `currentId` belongs to is passed over
 * unless nothing else is left.
 */
export function nextNeedingAttention(
  doc: EditorDocument,
  pages: readonly PageSnapshot[],
  currentId: string | null,
): ReviewTarget | null {
  const items = pages.flatMap((page) =>
    inDisplayOrder(page, pageItems(doc, page)),
  );
  const visited = new Set<string>();
  const stops: number[] = [];
  items.forEach((item, index) => {
    if (!isActionable(item.attention)) return;
    if (item.block !== null) {
      if (visited.has(item.block)) return;
      visited.add(item.block);
    }
    stops.push(index);
  });
  const current = items.findIndex((item) => item.target.id === currentId);
  const currentBlock = current < 0 ? null : items[current].block;
  const ordered = [
    ...stops.filter((index) => index > current),
    ...stops.filter((index) => index <= current),
  ].map((index) => items[index]);
  const next =
    ordered.find(
      (item) => currentBlock === null || item.block !== currentBlock,
    ) ?? ordered[0];
  return next?.target ?? null;
}

interface ReviewItem {
  target: ReviewTarget;
  attention: ImageAttention | null;
  /** The figure or formula the item belongs to (documentBlockId); null for none. */
  block: string | null;
  bounds: PageRect;
}

/** Every image and run on the page, images first, with what it needs. */
function pageItems(doc: EditorDocument, page: PageSnapshot): ReviewItem[] {
  const { images, runs } = pageAttention(doc, page);
  const blockOf = (key: string | null | undefined) =>
    key ? documentBlockId(doc, page.pageIndex, key) : null;
  const items: ReviewItem[] = [
    ...page.images.map((image) => ({
      target: {
        kind: "image" as const,
        id: image.id,
        pageIndex: page.pageIndex,
      },
      attention: images.get(image.id) ?? null,
      block:
        image.mcid === undefined
          ? null
          : blockOf(doc.structure(page.pageIndex).block(image.mcid)?.key),
      bounds: image.bounds,
    })),
    ...page.runs.map((run) => ({
      target: { kind: "text" as const, id: run.id, pageIndex: page.pageIndex },
      attention: runs.get(run.id) ?? null,
      block: blockOf(describableTextBlock(doc, run)?.key),
      bounds: run.bounds,
    })),
  ];
  return items;
}

/** Top to bottom as the page shows them, so a turned page reads in its turned order. */
function inDisplayOrder(page: PageSnapshot, items: ReviewItem[]): ReviewItem[] {
  const transform = DisplayTransform.fromData(page.display);
  const displayedTop = ({ x, y, width, height }: PageRect) =>
    Math.max(transform.apply(x, y).y, transform.apply(x + width, y + height).y);
  const tops = new Map(items.map((item) => [item, displayedTop(item.bounds)]));
  // Stable, so items at one height keep images-then-text draw order.
  return [...items].sort((a, b) => tops.get(b)! - tops.get(a)!);
}
