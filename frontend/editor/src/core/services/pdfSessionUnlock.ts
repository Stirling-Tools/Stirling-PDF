import apiClient from "@app/services/apiClient";
import axios from "axios";
import i18n from "i18next";
import {
  getPdfAccess,
  rememberPdfAccess,
  type PdfAccess,
} from "@app/services/pdfPasswordStore";
import type { StirlingFile } from "@app/types/fileContext";
import { PdfPermissionFlag } from "@embedpdf/models";

/** Stored restrictions apply until the server verifies the permissions credential. */
export function pdfAllows(
  access: PdfAccess | undefined,
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
    access.ownerAuthenticated ||
    (access.permissions & flag) !== 0
  );
}

/** Inspect original bytes even when an older library record missed owner-only encryption. */
export async function ensurePdfAccess(file: File): Promise<PdfAccess> {
  const existing = getPdfAccess(file);
  if (existing) return existing;
  const access = await unlockPdfForSession(file, "");
  if (!getPdfAccess(file)) rememberPdfAccess(file, access);
  return getPdfAccess(file)!;
}

const SUPPORTED_ENDPOINTS = new Set([
  "/api/v1/security/add-password",
  "/api/v1/security/remove-password",
  "/api/v1/general/rotate-pdf",
  "/api/v1/general/remove-pages",
  "/api/v1/general/rearrange-pages",
  "/api/v1/general/merge-pdfs",
  "/api/v1/general/split-pages",
  "/api/v1/general/split-pdf-by-sections",
  "/api/v1/general/split-by-size-or-count",
  "/api/v1/general/split-pdf-by-chapters",
  "/api/v1/general/split-for-poster-print",
  "/api/v1/misc/auto-split-pdf",
  "/api/v1/misc/compress-pdf",
]);

async function requestWorkingPdf(
  endpoint: string,
  form: FormData,
  message: string,
): Promise<Blob> {
  try {
    const response = await apiClient.post<Blob>(endpoint, form, {
      responseType: "blob",
      suppressErrorToast: true,
    });
    return response.data;
  } catch {
    // Axios errors carry the password-bearing request form into tool logs and failure history.
    throw new Error(message);
  }
}

/** These interactive operations restore protection before exposing or persisting any result. */
export function supportsSessionUnlock(endpoint: string | undefined): boolean {
  return endpoint !== undefined && SUPPORTED_ENDPOINTS.has(endpoint);
}

/** Authenticate without rewriting the uploaded document. The password stays outside file metadata. */
export async function unlockPdfForSession(
  file: File,
  password: string,
): Promise<PdfAccess> {
  const form = new FormData();
  form.append("fileInput", file);
  form.append("password", password);
  try {
    const response = await apiClient.post<Omit<PdfAccess, "password">>(
      "/api/v1/security/inspect-pdf-security",
      form,
      { suppressErrorToast: true },
    );
    if (
      typeof response.data?.encrypted !== "boolean" ||
      typeof response.data?.ownerAuthenticated !== "boolean" ||
      !Number.isInteger(response.data?.permissions)
    )
      throw new Error("Unable to verify PDF security");
    return { ...response.data, password };
  } catch (error) {
    const sanitized = new Error(
      error instanceof Error ? error.message : "Unable to unlock this PDF.",
    );
    if (axios.isAxiosError(error)) {
      // Keep password-error classification without retaining the request or its FormData.
      Object.assign(sanitized, {
        isAxiosError: true,
        response: error.response
          ? { status: error.response.status, data: error.response.data }
          : undefined,
      });
    }
    throw sanitized;
  }
}

/** Signed protected PDFs remain view-only until their edits can preserve signatures. */
export function assertPdfSessionEditable(
  access:
    | (Pick<PdfAccess, "encrypted" | "signed"> & Partial<PdfAccess>)
    | undefined,
): void {
  if (access?.encrypted && access.signed)
    throw new Error(
      i18n.t(
        "encryptedPdfUnlock.signedReadOnly",
        "This PDF has digital signatures. Session unlocking supports viewing it, but processing signed PDFs is not supported yet.",
      ),
    );
  if (
    access?.encrypted &&
    !access.ownerAuthenticated &&
    access.canModify !== true
  )
    throw new Error(
      i18n.t(
        "encryptedPdfUnlock.restrictedOperation",
        "This action requires the permissions password.",
      ),
    );
}

/** Native exports must retain source protection before storage or download can receive them. */
export async function verifyEditedPdfProtection(
  output: File,
  sourceAccess: PdfAccess | undefined,
): Promise<void> {
  if (!sourceAccess?.encrypted) return;
  assertPdfSessionEditable(sourceAccess);
  const access = await unlockPdfForSession(output, sourceAccess.password);
  if (
    !access.encrypted ||
    access.permissions !== sourceAccess.permissions ||
    access.ownerAuthenticated !== sourceAccess.ownerAuthenticated ||
    sourceAccess.encryptionKeyLength === undefined ||
    access.encryptionKeyLength !== sourceAccess.encryptionKeyLength ||
    sourceAccess.encryptionRevision === undefined ||
    access.encryptionRevision !== sourceAccess.encryptionRevision ||
    !sourceAccess.credentialFingerprint ||
    access.credentialFingerprint !== sourceAccess.credentialFingerprint
  )
    throw new Error(
      i18n.t(
        "encryptedPdfUnlock.restoreFailed",
        "Unable to preserve PDF protection. No unprotected result was saved.",
      ),
    );
  rememberPdfAccess(output, access);
}

/** Decrypted bytes belong only to this operation. They must never enter FileContext or persistence. */
export async function prepareUnlockedFile(
  file: StirlingFile,
  endpoint: string | undefined,
): Promise<File> {
  if (
    endpoint === "/api/v1/security/remove-password" ||
    endpoint === "/api/v1/security/add-password"
  )
    return file;
  if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name))
    return file;
  const access = await ensurePdfAccess(file);
  if (!access.encrypted) return file;
  if (!supportsSessionUnlock(endpoint))
    throw new Error(
      i18n.t(
        "encryptedPdfUnlock.unsupportedTool",
        "This tool cannot yet preserve this document's protection.",
      ),
    );
  if (access.signed)
    throw new Error(
      i18n.t(
        "encryptedPdfUnlock.signedReadOnly",
        "This PDF has digital signatures. Session unlocking supports viewing it, but processing signed PDFs is not supported yet.",
      ),
    );
  const permission =
    endpoint === "/api/v1/misc/compress-pdf"
      ? PdfPermissionFlag.ModifyContents
      : endpoint?.includes("split")
        ? PdfPermissionFlag.CopyContents
        : PdfPermissionFlag.AssembleDocument;
  if (!pdfAllows(access, permission))
    throw new Error(
      i18n.t(
        "encryptedPdfUnlock.restrictedOperation",
        "This action requires the permissions password.",
      ),
    );
  const form = new FormData();
  form.append("fileInput", file);
  form.append("password", access.password);
  form.append("endpoint", endpoint!);
  const bytes = await requestWorkingPdf(
    "/api/v1/security/prepare-pdf-session",
    form,
    i18n.t(
      "encryptedPdfUnlock.prepareFailed",
      "Unable to prepare this protected PDF for processing.",
    ),
  );
  return new File([bytes], file.name, { type: "application/pdf" });
}

/** Restore protection before a PDF can reach downloads or storage; mixed protected inputs are unsupported. */
export async function protectUnlockedResults(
  outputs: File[],
  inputs: readonly File[],
  endpoint: string | undefined,
): Promise<File[]> {
  if (
    endpoint === "/api/v1/security/remove-password" ||
    endpoint === "/api/v1/security/add-password"
  )
    return outputs;
  if (inputs.filter((file) => getPdfAccess(file)?.encrypted).length > 1)
    throw new Error(
      i18n.t(
        "encryptedPdfUnlock.mixedProtection",
        "Combining multiple protected documents requires choosing an output protection policy. Process them separately for now.",
      ),
    );
  const source = inputs.find((file) => getPdfAccess(file)?.encrypted);
  if (!source) return outputs;
  const access = getPdfAccess(source)!;
  const protectedFiles: File[] = [];
  for (const output of outputs) {
    if (
      output.type !== "application/pdf" &&
      !output.name.toLowerCase().endsWith(".pdf")
    )
      throw new Error(
        i18n.t(
          "encryptedPdfUnlock.restoreFailed",
          "Unable to preserve PDF protection. No unprotected result was saved.",
        ),
      );
    const form = new FormData();
    form.append("fileInput", output);
    form.append("sourceFile", source);
    form.append("password", access.password);
    const bytes = await requestWorkingPdf(
      "/api/v1/security/restore-pdf-protection",
      form,
      i18n.t(
        "encryptedPdfUnlock.restoreFailed",
        "Unable to preserve PDF protection. No unprotected result was saved.",
      ),
    );
    const file = new File([bytes], output.name, {
      type: "application/pdf",
    });
    rememberPdfAccess(file, { ...access, signed: false });
    protectedFiles.push(file);
  }
  return protectedFiles;
}

/** Interactive security changes use stricter contracts than the legacy public API. */
export async function changePdfSecurity(
  file: File,
  form: FormData,
  endpoint: string,
): Promise<Blob> {
  const settingProtection = endpoint === "/api/v1/security/add-password";
  if (settingProtection) {
    const access = await ensurePdfAccess(file);
    if (access.encrypted && !access.ownerAuthenticated)
      throw new Error(
        i18n.t(
          "encryptedPdfUnlock.ownerRequired",
          "Enter the permissions password to allow restricted actions.",
        ),
      );
    if (access.encrypted && !form.has("keyLength"))
      throw new Error(
        i18n.t(
          "encryptedPdfUnlock.changeWithAddPassword",
          "Use Add Password to explicitly choose new passwords and restrictions for this protected document.",
        ),
      );
    form.set("sourcePassword", access.password);
  }
  return requestWorkingPdf(
    settingProtection
      ? "/api/v1/security/set-pdf-protection"
      : "/api/v1/security/remove-pdf-opening-password",
    form,
    i18n.t(
      "encryptedPdfUnlock.securityChangeFailed",
      "Unable to change protection. Check the permissions password and the new security settings.",
    ),
  );
}
