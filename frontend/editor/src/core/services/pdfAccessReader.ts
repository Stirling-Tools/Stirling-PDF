import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { PdfPermissionFlag } from "@embedpdf/models";
import type { PdfAccess } from "@app/services/pdfPasswordStore";

/** Reads the authenticated document without reopening it or changing its protection. */
export function readPdfiumAccess(
  module: WrappedPdfiumModule,
  document: number,
  password: string,
): PdfAccess {
  const encrypted = module.EPDF_IsEncrypted(document);
  const ownerAuthenticated = encrypted && module.EPDF_IsOwnerUnlocked(document);
  const permissions = module.FPDF_GetDocUserPermissions(document);
  const encryptionRevision = module.FPDF_GetSecurityHandlerRevision(document);
  const signatureCount = module.FPDF_GetSignatureCount(document);
  if (
    !Number.isInteger(permissions) ||
    signatureCount < 0 ||
    (encrypted && encryptionRevision < 2)
  )
    throw new Error("Unable to verify PDF security");
  const allows = (flag: PdfPermissionFlag) =>
    !encrypted || ownerAuthenticated || (permissions & flag) !== 0;
  return {
    password,
    localInspection: true,
    encrypted,
    ownerAuthenticated,
    permissions,
    encryptionRevision,
    signed: signatureCount > 0,
    pageCount: module.FPDF_GetPageCount(document),
    canModify: allows(PdfPermissionFlag.ModifyContents),
    canAssemble: allows(
      encryptionRevision === 2
        ? PdfPermissionFlag.ModifyContents
        : PdfPermissionFlag.AssembleDocument,
    ),
    canExtract: allows(PdfPermissionFlag.CopyContents),
    canPrint: allows(PdfPermissionFlag.Print),
    canPrintFaithful: allows(
      encryptionRevision === 2
        ? PdfPermissionFlag.Print
        : PdfPermissionFlag.PrintHighQuality,
    ),
    requiresOpeningPassword: password === "" ? false : undefined,
    openingAuthenticated: encrypted && !ownerAuthenticated ? true : undefined,
  };
}
