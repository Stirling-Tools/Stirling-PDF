import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type {
  DescribableType,
  DescriptionBlocker,
} from "@editor/tools/pdfTextEditor/model/PageStructure";
import type { ImageObjectSnapshot } from "@editor/tools/pdfTextEditor/types";
import { sharesMarkList } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";

/** What can be said and done about one image's accessibility. */
export type ImageAccessibility =
  | { kind: "decorative"; canUndecorate: boolean }
  | { kind: "blocked"; blocker: DescriptionBlocker; documentTagged: boolean }
  | {
      kind: "describable";
      description: string | null;
      /** Null for an image no element owns yet: describing it adds a Figure. */
      type: DescribableType | null;
      canBeDecorative: boolean;
    };

export function imageAccessibility(
  doc: EditorDocument,
  image: ImageObjectSnapshot,
): ImageAccessibility {
  const retaggable = retaggableTag(doc, image) !== null;
  if (image.artifact) return { kind: "decorative", canUndecorate: retaggable };
  const mcid = ownedMcid(doc, image);
  if (mcid === undefined) {
    if (!retaggable) return blocked(doc, "untagged");
    return {
      kind: "describable",
      description: null,
      type: null,
      canBeDecorative: true,
    };
  }
  const structure = doc.structure(image.pageIndex);
  const blocker = structure.cannotDescribe(mcid);
  if (blocker) return blocked(doc, blocker);
  if (structure.decorative(mcid)) {
    return { kind: "decorative", canUndecorate: true };
  }
  return {
    kind: "describable",
    description: structure.alt(mcid),
    type: structure.describableType(mcid),
    canBeDecorative:
      retaggable || structure.cannotMarkDecorative(mcid) === null,
  };
}

/** How an image is tagged, where TagImageCommand can change it. */
export type RetaggableTag =
  | { kind: "untagged" }
  | { kind: "artifact" }
  | {
      kind: "element";
      type: DescribableType;
      mcid: number;
      alt: string | null;
    };

/**
 * The image's tag when TagImageCommand can change it: an image the page
 * itself draws, whose save can add an element, that is untagged, an
 * artifact, or a figure or formula the session added. Null otherwise, for
 * content the file's elements own among the rest.
 */
export function retaggableTag(
  doc: EditorDocument,
  image: ImageObjectSnapshot,
): RetaggableTag | null {
  if (image.inForm) return null;
  const structure = doc.structure(image.pageIndex);
  if (structure.cannotAddElement()) return null;
  const mcid = ownedMcid(doc, image);
  if (mcid === undefined) {
    // Drawn in one marked-content sequence with other content, the image can only
    // be tagged with it, which tagging that content does.
    const page = doc.page(image.pageIndex);
    const object = page.findImage(image.id);
    if (
      object &&
      sharesMarkList(doc.module, page.pagePtr, object.pdfiumObjPtr)
    ) {
      return null;
    }
    return image.artifact ? { kind: "artifact" } : { kind: "untagged" };
  }
  const type = structure.describableType(mcid);
  if (!structure.isAdded(mcid) || !type) return null;
  return { kind: "element", type, mcid, alt: structure.alt(mcid) };
}

/** The image's MCID when an element owns it; undefined when none does, which leaves it untagged. */
export function ownedMcid(
  doc: EditorDocument,
  image: ImageObjectSnapshot,
): number | undefined {
  if (image.mcid === undefined) return undefined;
  return doc.structure(image.pageIndex).owns(image.mcid)
    ? image.mcid
    : undefined;
}

function blocked(
  doc: EditorDocument,
  blocker: DescriptionBlocker,
): ImageAccessibility {
  return { kind: "blocked", blocker, documentTagged: doc.treatAsTagged() };
}

/**
 * Why an image needs the user's attention: it can take a description and has
 * none, or it sits untagged in a tagged document, unreachable by a screen
 * reader. An untagged image is "untaggable" when nothing here can tag it.
 */
export type ImageAttention = "needs-description" | "untagged" | "untaggable";

export function attentionFor(
  accessibility: ImageAccessibility,
): ImageAttention | null {
  if (accessibility.kind === "describable") {
    if (accessibility.type === null) return "untagged";
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
