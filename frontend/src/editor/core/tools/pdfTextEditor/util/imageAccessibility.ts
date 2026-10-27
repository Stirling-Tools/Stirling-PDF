import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { DescriptionBlocker } from "@editor/tools/pdfTextEditor/model/PageStructure";
import type {
  ImageObjectSnapshot,
  PageSnapshot,
} from "@editor/tools/pdfTextEditor/types";

/** What can be said and done about one image's accessibility. */
export type ImageAccessibility =
  | { kind: "decorative"; canUndecorate: boolean }
  | { kind: "blocked"; blocker: DescriptionBlocker; documentTagged: boolean }
  | {
      kind: "describable";
      description: string | null;
      /** False for an image no element owns yet: describing it adds one. */
      tagged: boolean;
      canBeDecorative: boolean;
    };

export function imageAccessibility(
  doc: EditorDocument,
  image: ImageObjectSnapshot,
): ImageAccessibility {
  const retaggable = retaggableTag(doc, image) !== null;
  if (image.artifact) return { kind: "decorative", canUndecorate: retaggable };
  if (image.mcid === undefined) {
    if (!retaggable) return blocked(doc, "untagged");
    return {
      kind: "describable",
      description: null,
      tagged: false,
      canBeDecorative: true,
    };
  }
  const structure = doc.structure(image.pageIndex);
  const blocker = structure.cannotDescribe(image.mcid);
  if (blocker) return blocked(doc, blocker);
  if (structure.decorative(image.mcid)) {
    return { kind: "decorative", canUndecorate: true };
  }
  return {
    kind: "describable",
    description: structure.alt(image.mcid),
    tagged: true,
    canBeDecorative:
      retaggable || structure.cannotMarkDecorative(image.mcid) === null,
  };
}

/** How an image is tagged, where TagImageCommand can change it. */
export type RetaggableTag =
  | { kind: "untagged" }
  | { kind: "artifact" }
  | { kind: "figure"; mcid: number; alt: string | null };

/**
 * The image's tag when TagImageCommand can change it: an image the page
 * itself draws in a tagged document, that is untagged, an artifact, or a
 * figure the session added. Null otherwise, for content the file's elements
 * own among the rest.
 */
export function retaggableTag(
  doc: EditorDocument,
  image: ImageObjectSnapshot,
): RetaggableTag | null {
  if (!doc.isTagged() || image.inForm) return null;
  const structure = doc.structure(image.pageIndex);
  if (structure.cannotAddFigure()) return null;
  if (image.mcid === undefined) {
    return image.artifact ? { kind: "artifact" } : { kind: "untagged" };
  }
  if (!structure.isAdded(image.mcid)) return null;
  return {
    kind: "figure",
    mcid: image.mcid,
    alt: structure.alt(image.mcid),
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
 * reader. An untagged image is "untaggable" when nothing here can tag it.
 */
export type ImageAttention = "needs-description" | "untagged" | "untaggable";

/** Images needing attention, by reason. */
export interface ImageReview {
  needsDescription: number;
  untagged: number;
  untaggable: number;
}

export function attentionFor(
  accessibility: ImageAccessibility,
): ImageAttention | null {
  if (accessibility.kind === "describable") {
    if (!accessibility.tagged) return "untagged";
    return accessibility.description?.trim() ? null : "needs-description";
  }
  if (
    accessibility.kind === "blocked" &&
    accessibility.blocker === "untagged" &&
    accessibility.documentTagged
  ) {
    return "untaggable";
  }
  return null;
}

/** Attention the user can resolve here, which Next walks through. */
export function isActionable(attention: ImageAttention | null): boolean {
  return attention === "needs-description" || attention === "untagged";
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
  const review: ImageReview = {
    needsDescription: 0,
    untagged: 0,
    untaggable: 0,
  };
  for (const image of pages.flatMap((page) => page.images)) {
    const attention = imageAttention(doc, image);
    if (attention === "needs-description") review.needsDescription++;
    if (attention === "untagged") review.untagged++;
    if (attention === "untaggable") review.untaggable++;
  }
  return review;
}

/**
 * The first image with actionable attention after `currentId`, in page order
 * and then the order each page draws its images, wrapping round to the start.
 * Covers only the pages in `pages` that have been read.
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
    if (isActionable(imageAttention(doc, image))) return image;
  }
  return null;
}
