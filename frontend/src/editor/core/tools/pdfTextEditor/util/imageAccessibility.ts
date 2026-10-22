import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { DescriptionBlocker } from "@editor/tools/pdfTextEditor/model/PageStructure";
import type {
  ImageObjectSnapshot,
  PageSnapshot,
} from "@editor/tools/pdfTextEditor/types";

/** What can be said and done about one image's accessibility. */
export type ImageAccessibility =
  | { kind: "decorative" }
  | { kind: "blocked"; blocker: DescriptionBlocker; documentTagged: boolean }
  | {
      kind: "describable";
      pageIndex: number;
      mcid: number;
      description: string | null;
    };

export function imageAccessibility(
  doc: EditorDocument,
  image: ImageObjectSnapshot,
): ImageAccessibility {
  if (image.artifact) return { kind: "decorative" };
  if (image.mcid === undefined) return blocked(doc, "untagged");
  const structure = doc.structure(image.pageIndex);
  const blocker = structure.cannotDescribe(image.mcid);
  if (blocker) return blocked(doc, blocker);
  return {
    kind: "describable",
    pageIndex: image.pageIndex,
    mcid: image.mcid,
    description: structure.alt(image.mcid),
  };
}

function blocked(
  doc: EditorDocument,
  blocker: DescriptionBlocker,
): ImageAccessibility {
  return { kind: "blocked", blocker, documentTagged: doc.isTagged() };
}

/**
 * Why an image needs the user's attention: it can take a description and has
 * none, or it sits untagged in a tagged document, unreachable by a screen
 * reader.
 */
export type ImageAttention = "needs-description" | "untagged";

/** Images needing attention, by reason. */
export interface ImageReview {
  needsDescription: number;
  untagged: number;
}

export function attentionFor(
  accessibility: ImageAccessibility,
): ImageAttention | null {
  if (accessibility.kind === "describable") {
    return accessibility.description?.trim() ? null : "needs-description";
  }
  if (
    accessibility.kind === "blocked" &&
    accessibility.blocker === "untagged" &&
    accessibility.documentTagged
  ) {
    return "untagged";
  }
  return null;
}

export function imageAttention(
  doc: EditorDocument,
  image: ImageObjectSnapshot,
): ImageAttention | null {
  return attentionFor(imageAccessibility(doc, image));
}

export function reviewImages(
  doc: EditorDocument,
  pages: readonly PageSnapshot[],
): ImageReview {
  const review: ImageReview = { needsDescription: 0, untagged: 0 };
  for (const image of pages.flatMap((page) => page.images)) {
    const attention = imageAttention(doc, image);
    if (attention === "needs-description") review.needsDescription++;
    if (attention === "untagged") review.untagged++;
  }
  return review;
}

/**
 * The first image needing attention after `currentId`, in page order and then
 * the order each page draws its images, wrapping round to the start. Covers
 * only the pages in `pages` that have been read.
 */
export function nextImageNeedingAttention(
  doc: EditorDocument,
  pages: readonly PageSnapshot[],
  currentId: string | null,
): ImageObjectSnapshot | null {
  const images = pages.flatMap((page) => page.images);
  // An id not in the list (or none) yields 0: start from the first image.
  const start = images.findIndex((img) => img.id === currentId) + 1;
  for (let i = 0; i < images.length; i++) {
    const image = images[(start + i) % images.length];
    if (imageAttention(doc, image)) return image;
  }
  return null;
}
