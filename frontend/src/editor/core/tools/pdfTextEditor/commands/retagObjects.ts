import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  addTagMark,
  markListKey,
  removeTagMark,
  type TagMark,
} from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";

/** A page object to retag, and the marks it loses. */
export interface ObjectRetag {
  ptr: number;
  dropped: readonly TagMark[];
}

/** Replace the object's dropped marks with `tag`. */
export function retagObject(
  doc: EditorDocument,
  object: ObjectRetag,
  tag: TagMark,
): void {
  for (const dropped of [...object.dropped].reverse()) {
    if (!removeTagMark(doc.module, object.ptr, dropped.name)) {
      throw new Error("PDFium could not remove a tag");
    }
  }
  if (!addTagMark(doc.module, doc.docPtr, object.ptr, tag)) {
    throw new Error("PDFium could not tag the content");
  }
}

/** Undo retagObject, which gave the object a tag named `name`. Best effort. */
export function restoreObject(
  doc: EditorDocument,
  object: ObjectRetag,
  name: string,
): void {
  removeTagMark(doc.module, object.ptr, name);
  for (const dropped of object.dropped) {
    addTagMark(doc.module, doc.docPtr, object.ptr, dropped);
  }
}

/**
 * The objects to retag so each mark list is retagged once (markListKey): a second
 * object on a list already retagged would find its marks gone.
 */
export function oneObjectPerMarkList(
  m: WrappedPdfiumModule,
  objects: readonly ObjectRetag[],
): ObjectRetag[] {
  const seen = new Set<number>();
  return objects.filter(({ ptr }) => {
    const key = markListKey(m, ptr);
    if (key === null) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
