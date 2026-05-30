import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import { PdfiumSave } from "@app/tools/pdfTextEditor/v2/pdfium/PdfiumSave";

/** Serialize the editor document to a Blob plus the default filename. */
export function exportToBlob(doc: EditorDocument): {
  blob: Blob;
  filename: string;
} {
  const bytes = PdfiumSave.serialize(doc);
  const blob = new Blob([bytes as unknown as ArrayBuffer], {
    type: "application/pdf",
  });
  return { blob, filename: "edited.pdf" };
}

/**
 * Open the exported PDF in a new window and trigger print. Falls back to
 * downloading the file if the browser blocked the pop-up.
 */
export function printDocument(
  doc: EditorDocument,
  onFallbackDownload: (blob: Blob, name: string) => void,
): void {
  const { blob, filename } = exportToBlob(doc);
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) {
    onFallbackDownload(blob, filename);
    URL.revokeObjectURL(url);
    return;
  }
  win.addEventListener("load", () => {
    try {
      win.print();
    } catch {
      /* user dismissed or browser blocked the dialog */
    }
  });
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
