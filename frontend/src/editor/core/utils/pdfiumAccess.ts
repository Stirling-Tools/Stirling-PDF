import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { PdfAccess } from "@editor/services/pdfAccessService";

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
  return {
    password,
    encrypted,
    ownerAuthenticated,
    permissions,
    encryptionRevision,
    signed: signatureCount > 0,
    pageCount: module.FPDF_GetPageCount(document),
    requiresOpeningPassword: password === "" ? false : undefined,
    openingAuthenticated: encrypted && !ownerAuthenticated ? true : undefined,
  };
}
