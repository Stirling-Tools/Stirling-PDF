import { printPdfBlob as printPdfBlobInFrame } from "@core/services/printService";
import { printPdfNatively } from "@app/services/nativePrintService";
import { DesktopOs, getDesktopOs } from "@app/services/platformService";

/** Desktop build of the print seam. */
export async function printPdfBlob(
  blob: Blob,
  fileName: string,
): Promise<void> {
  if ((await getDesktopOs()) === DesktopOs.Mac) {
    await printPdfNatively(blob, fileName);
    return;
  }

  await printPdfBlobInFrame(blob, fileName);
}
