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
  for (const page of pages) {
    const { images, runs } = pageAttention(doc, page);
    for (const attention of images.values()) {
      if (attention === "needs-description") review.needsDescription++;
      if (attention === "untagged") review.untagged++;
      if (attention === "untaggable") review.untaggable++;
    }
    review.needsDescription += runs.size;
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
 * on the read pages (or null) starts from the first.
 */
export function nextNeedingAttention(
  doc: EditorDocument,
  pages: readonly PageSnapshot[],
  currentId: string | null,
): ReviewTarget | null {
  const items = pages.flatMap((page) => pageItems(doc, page));
  const start = items.findIndex((item) => item.target.id === currentId) + 1;
  for (let i = 0; i < items.length; i++) {
    const item = items[(start + i) % items.length];
    if (item.actionable) return item.target;
  }
  return null;
}

/** Every image and run on the page, top to bottom, and whether Next stops there. */
function pageItems(
  doc: EditorDocument,
  page: PageSnapshot,
): { target: ReviewTarget; actionable: boolean; bounds: PageRect }[] {
  const { images, runs } = pageAttention(doc, page);
  const items = [
    ...page.images.map((image) => ({
      target: {
        kind: "image" as const,
        id: image.id,
        pageIndex: page.pageIndex,
      },
      actionable: isActionable(images.get(image.id) ?? null),
      bounds: image.bounds,
    })),
    ...page.runs.map((run) => ({
      target: { kind: "text" as const, id: run.id, pageIndex: page.pageIndex },
      actionable: runs.has(run.id),
      bounds: run.bounds,
    })),
  ];
  // Stable, so items at one height keep images-then-text draw order.
  return items.sort((a, b) => top(b.bounds) - top(a.bounds));
}

function top(bounds: PageRect): number {
  return bounds.y + bounds.height;
}
