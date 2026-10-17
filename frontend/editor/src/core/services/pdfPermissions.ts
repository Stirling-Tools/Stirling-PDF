import type { PdfAccess } from "@app/services/pdfPasswordStore";
import { PdfPermissionFlag } from "@app/contexts/viewer/viewerBridges";

/** Applies owner policy and rejects low-quality-only printing, which this viewer cannot produce. */
export function canPrintPdf(
  access:
    | (Pick<PdfAccess, "encrypted" | "ownerAuthenticated" | "permissions"> &
        Partial<Pick<PdfAccess, "honorOwnerPasswords" | "encryptionRevision">>)
    | undefined,
): boolean {
  if (!access) return false;
  return (
    !access.encrypted ||
    access.ownerAuthenticated ||
    access.honorOwnerPasswords === false ||
    ((access.permissions & PdfPermissionFlag.Print) !== 0 &&
      (access.encryptionRevision === 2 ||
        (access.permissions & PdfPermissionFlag.PrintHighQuality) !== 0))
  );
}
