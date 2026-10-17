import { printPdfBlob as printPdfBlobInFrame } from "@core/services/printService";
import { printPdfNatively } from "@app/services/nativePrintService";
import { DesktopOs, getDesktopOs } from "@app/services/platformService";

/** Desktop build of the print seam. */
export async function printPdfBlob(
  blob: Blob,
  fileName: string,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) {
    throw new DOMException("Print cancelled", "AbortError");
  }
  if ((await getDesktopOs()) === DesktopOs.Mac) {
    // The OS panel owns the document once it is handed over, so the signal can
    // only cover the wait before the handoff.
    if (signal?.aborted) {
      throw new DOMException("Print cancelled", "AbortError");
    }
    await printPdfNatively(blob, fileName);
    return;
  }

  await printPdfBlobInFrame(blob, fileName, signal);
}
