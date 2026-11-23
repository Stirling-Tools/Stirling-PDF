import i18n from "i18next";
import {
  RolledBackError,
  type Command,
} from "@editor/tools/pdfTextEditor/commands/Command";
import { descriptionCoalesceKey } from "@editor/tools/pdfTextEditor/commands/SetAltTextCommand";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { ImageObject } from "@editor/tools/pdfTextEditor/model/ImageObject";
import type { DescribableType } from "@editor/tools/pdfTextEditor/model/PageStructure";
import {
  ARTIFACT_TAG,
  addTagMark,
  highestMcid,
  readTagMarks,
  removeTagMark,
} from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";
import {
  retaggableTag,
  type RetaggableTag,
} from "@editor/tools/pdfTextEditor/util/imageAccessibility";

/**
 * Tag an image as a new Figure or Formula, or as an artifact, where
 * retaggableTag allows. Unlike a description this changes the image's marks,
 * so the save regenerates the content stream that draws it, and the save pass
 * then gives a new element its place in the tree. The mark is named after the
 * element's type, as marked-content tags conventionally are.
 */
export class TagImageCommand implements Command {
  readonly type = "tag-image";
  private readonly pageIndex: number;
  private readonly imageId: string;
  private readonly as: DescribableType | "artifact";
  private readonly alt: string | null;
  /** Chosen on first apply, so a redo reuses it. */
  private mcid: number | null = null;
  private previous: RetaggableTag | undefined;

  constructor(opts: {
    pageIndex: number;
    imageId: string;
    as: DescribableType | "artifact";
    /** The new element's description. */
    alt?: string | null;
  }) {
    this.pageIndex = opts.pageIndex;
    this.imageId = opts.imageId;
    this.as = opts.as;
    this.alt = opts.alt ?? null;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const image = page.findImage(this.imageId);
    const current = image ? retaggableTag(doc, image.snapshot()) : null;
    if (!image || !current) {
      throw new RolledBackError(
        new Error(
          i18n.t(
            "pdfTextEditor.inspector.accessibility.cannotChange",
            "This image's accessibility can't be changed.",
          ),
        ),
      );
    }
    this.previous ??= current;
    if (this.as !== "artifact") {
      this.mcid ??= doc
        .structure(this.pageIndex)
        .freeMcid(highestMcid(doc.module, page.pagePtr));
    }
    retag(doc, image, current, this.target());
    page.markDirty();
    page.markNeedsGenerate();
  }

  revert(doc: EditorDocument): void {
    if (this.previous === undefined) return;
    const page = doc.page(this.pageIndex);
    const image = page.findImage(this.imageId);
    const current = image ? retaggableTag(doc, image.snapshot()) : null;
    if (!image || !current) return;
    retag(doc, image, current, this.previous);
    page.markDirty();
    page.markNeedsGenerate();
  }

  /** Describing an untagged image and typing on in its field is one undo step. */
  coalesceKey(): string | null {
    if (this.mcid === null || this.alt === null) return null;
    return descriptionCoalesceKey(this.pageIndex, this.mcid);
  }

  private target(): RetaggableTag {
    if (this.as === "artifact") return { kind: "artifact" };
    return { kind: "element", type: this.as, mcid: this.mcid!, alt: this.alt };
  }
}

function retag(
  doc: EditorDocument,
  image: ImageObject,
  from: RetaggableTag,
  to: RetaggableTag,
): void {
  const m = doc.module;
  const structure = doc.structure(image.pageIndex);
  const objPtr = image.pdfiumObjPtr;
  if (from.kind === "artifact") {
    marked(removeTagMark(m, objPtr, ARTIFACT_TAG));
  }
  if (from.kind === "element") {
    // A retag since it was added changed the element's type but not its mark.
    const mark = readTagMarks(m, objPtr).find(({ mcid }) => mcid === from.mcid);
    if (mark) marked(removeTagMark(m, objPtr, mark.name));
    structure.removeElement(from.mcid);
  }
  image.mcid = null;
  image.artifact = false;
  if (to.kind === "artifact") {
    marked(
      addTagMark(m, doc.docPtr, objPtr, { name: ARTIFACT_TAG, mcid: null }),
    );
    image.artifact = true;
  }
  if (to.kind === "element") {
    marked(addTagMark(m, doc.docPtr, objPtr, { name: to.type, mcid: to.mcid }));
    structure.addElement(to.mcid, to.type);
    if (to.alt !== null) structure.setAlt(to.mcid, to.alt);
    image.mcid = to.mcid;
  }
}

function marked(ok: boolean): void {
  if (!ok) throw new Error("PDFium could not change the image's tags");
}
