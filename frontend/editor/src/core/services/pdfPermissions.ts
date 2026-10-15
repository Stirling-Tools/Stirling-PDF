import type { PdfAccess } from "@app/services/pdfPasswordStore";
import { PdfPermissionFlag } from "@app/contexts/viewer/viewerBridges";

/** Owner authentication overrides restrictions; zero permissions on encrypted bytes denies printing. */
export function canPrintPdf(
  access:
    | Pick<PdfAccess, "encrypted" | "ownerAuthenticated" | "permissions">
    | undefined,
): boolean {
  return (
    !access?.encrypted ||
    access.ownerAuthenticated ||
    (access.permissions & PdfPermissionFlag.Print) !== 0
  );
}
