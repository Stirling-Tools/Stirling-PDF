import type { PdfAccess } from "@editor/services/pdfAccessService";
import { PdfPermissionFlag } from "@embedpdf/models";

type PermissionAccess = Pick<
  PdfAccess,
  "encrypted" | "ownerAuthenticated" | "permissions"
> &
  Partial<Pick<PdfAccess, "honorOwnerPasswords" | "encryptionRevision">>;

/** Grants actions without changing the document's actual authentication role. */
export function hasPdfPermissionOverride(
  access: Partial<PdfAccess> | undefined,
): boolean {
  return (
    access?.ownerAuthenticated === true || access?.honorOwnerPasswords === false
  );
}

/** Applies owner policy and the encryption revision's interpretation of stored permission flags. */
export function pdfAllows(
  access: PermissionAccess | undefined,
  flag: PdfPermissionFlag,
): boolean {
  if (!access) return false;
  if (
    access.encryptionRevision === 2 &&
    flag === PdfPermissionFlag.AssembleDocument
  )
    flag = PdfPermissionFlag.ModifyContents;
  if (
    access.encryptionRevision === 2 &&
    flag === PdfPermissionFlag.PrintHighQuality
  )
    flag = PdfPermissionFlag.Print;
  return (
    !access.encrypted ||
    hasPdfPermissionOverride(access) ||
    (access.permissions & flag) !== 0
  );
}

/** Applies owner policy and rejects low-quality-only printing, which this viewer cannot produce. */
export function canPrintPdf(access: PermissionAccess | undefined): boolean {
  return (
    pdfAllows(access, PdfPermissionFlag.Print) &&
    pdfAllows(access, PdfPermissionFlag.PrintHighQuality)
  );
}
