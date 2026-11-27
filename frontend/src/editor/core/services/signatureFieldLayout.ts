import {
  PDFAcroSignature,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRef,
  PDFWidgetAnnotation,
} from "@cantoo/pdf-lib";

export interface PdfBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EmptySignatureField {
  name: string;
  pageIndex: number;
  box: PdfBox;
}

export interface SignatureLayout {
  emptyFields: EmptySignatureField[];
  cropBoxes: PdfBox[];
}

/**
 * The unsigned, visible signature fields of a PDF in reading order (by page, then top to bottom,
 * then left to right) and every page's crop box, both in PDF user space. A field counts as signed
 * once it has a /V, matching what the cert-sign endpoint rejects.
 */
export async function readSignatureLayout(
  bytes: ArrayBuffer | Uint8Array,
): Promise<SignatureLayout> {
  const doc = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    updateMetadata: false,
    throwOnInvalidObject: false,
  });
  const pages = doc.getPages();
  const cropBoxes = pages.map((page) => page.getCropBox());

  const pageOfAnnotation = new Map<PDFRef, number>();
  pages.forEach((page, index) => {
    const annots = page.node.Annots();
    for (const entry of annots?.asArray() ?? []) {
      if (entry instanceof PDFRef) pageOfAnnotation.set(entry, index);
    }
  });
  const pageIndexOfRef = new Map(pages.map((page, index) => [page.ref, index]));

  const emptyFields: EmptySignatureField[] = [];
  for (const [field, fieldRef] of doc.catalog.getAcroForm()?.getAllFields() ??
    []) {
    if (!(field instanceof PDFAcroSignature)) continue;
    if (field.getInheritableAttribute(PDFName.of("V"))) continue;

    const widgetRef = firstWidgetRef(field.dict, fieldRef);
    const widgetDict = doc.context.lookupMaybe(widgetRef, PDFDict);
    if (!widgetDict || widgetDict.has(PDFName.of("V"))) continue;
    const rect = normalised(
      PDFWidgetAnnotation.fromDict(widgetDict).getRectangle(),
    );
    if (rect.width <= 0 || rect.height <= 0) continue;

    const pageRef = widgetDict.get(PDFName.of("P"));
    const pageIndex =
      pageOfAnnotation.get(widgetRef) ??
      (pageRef instanceof PDFRef ? pageIndexOfRef.get(pageRef) : undefined);
    if (pageIndex === undefined) continue;

    emptyFields.push({
      name: field.getFullyQualifiedName() ?? "",
      pageIndex,
      box: rect,
    });
  }

  emptyFields.sort(
    (a, b) =>
      a.pageIndex - b.pageIndex ||
      b.box.y + b.box.height - (a.box.y + a.box.height) ||
      a.box.x - b.box.x,
  );
  return { emptyFields, cropBoxes };
}

function normalised(rect: PdfBox): PdfBox {
  return {
    x: Math.min(rect.x, rect.x + rect.width),
    y: Math.min(rect.y, rect.y + rect.height),
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
}

function firstWidgetRef(fieldDict: PDFDict, fieldRef: PDFRef): PDFRef {
  const kids = fieldDict.lookupMaybe(PDFName.of("Kids"), PDFArray);
  const firstKid = kids?.get(0);
  return firstKid instanceof PDFRef ? firstKid : fieldRef;
}

/**
 * Converts a viewer stamp rectangle (origin top-left of the crop box, before page rotation, in
 * PDF points) into the PDF user-space box the cert-sign endpoint takes.
 */
export function viewerRectToPdfBox(rect: PdfBox, cropBox: PdfBox): PdfBox {
  return {
    x: cropBox.x + rect.x,
    y: cropBox.y + cropBox.height - rect.y - rect.height,
    width: rect.width,
    height: rect.height,
  };
}
