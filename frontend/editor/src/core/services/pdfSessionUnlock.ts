import apiClient from "@app/services/apiClient";
import axios from "axios";
import i18n from "i18next";
import {
  getPdfAccess,
  rememberPdfAccess,
  type PdfAccess,
} from "@app/services/pdfPasswordStore";
import type { StirlingFile } from "@app/types/fileContext";
import { zipFileService } from "@app/services/zipFileService";

const SUPPORTED_ENDPOINTS = new Set([
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
  access: Pick<PdfAccess, "encrypted" | "signed"> | undefined,
): void {
  if (access?.encrypted && access.signed)
    throw new Error(
      i18n.t(
        "encryptedPdfUnlock.signedReadOnly",
        "This PDF has digital signatures. Session unlocking supports viewing it, but processing signed PDFs is not supported yet.",
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
    access.encryptionRevision !== sourceAccess.encryptionRevision
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
  const access = getPdfAccess(file);
  if (!access?.encrypted || endpoint === "/api/v1/security/remove-password")
    return file;
  if (!supportsSessionUnlock(endpoint))
    throw new Error(
      i18n.t(
        "encryptedPdfUnlock.unsupportedTool",
        "This tool does not yet support session-unlocked PDFs. Use Remove Password explicitly to create an unprotected copy.",
      ),
    );
  if (access.signed)
    throw new Error(
      i18n.t(
        "encryptedPdfUnlock.signedReadOnly",
        "This PDF has digital signatures. Session unlocking supports viewing it, but processing signed PDFs is not supported yet.",
      ),
    );
  const permitted =
    endpoint === "/api/v1/misc/compress-pdf"
      ? access.canModify
      : access.canAssemble;
  if (!access.ownerAuthenticated && !permitted)
    throw new Error(
      i18n.t(
        "encryptedPdfUnlock.restrictedOperation",
        "This PDF restricts this operation. Reopen it with the owner password to continue.",
      ),
    );
  const form = new FormData();
  form.append("fileInput", file);
  form.append("password", access.password);
  const bytes = await requestWorkingPdf(
    "/api/v1/security/remove-password",
    form,
    i18n.t(
      "encryptedPdfUnlock.prepareFailed",
      "Unable to prepare this protected PDF for processing.",
    ),
  );
  return new File([bytes], file.name, { type: "application/pdf" });
}

function protectionRestoreError(): Error {
  return new Error(
    i18n.t(
      "encryptedPdfUnlock.restoreFailed",
      "Unable to preserve PDF protection. No unprotected result was saved.",
    ),
  );
}

async function protectPdfOutput(
  output: File,
  source: File,
  access: PdfAccess,
): Promise<File> {
  if (
    output.type !== "application/pdf" &&
    !output.name.toLowerCase().endsWith(".pdf")
  )
    throw protectionRestoreError();
  const form = new FormData();
  form.append("fileInput", output);
  form.append("sourceFile", source);
  form.append("password", access.password);
  const bytes = await requestWorkingPdf(
    "/api/v1/security/restore-pdf-protection",
    form,
    protectionRestoreError().message,
  );
  const file = new File([bytes], output.name, { type: "application/pdf" });
  rememberPdfAccess(file, { ...access, signed: false });
  return file;
}

/** Restore protection before results reach downloads or storage, including every PDF in a ZIP. Merges inherit the first protected input. */
export async function protectUnlockedResults(
  outputs: File[],
  inputs: readonly File[],
  endpoint: string | undefined,
): Promise<File[]> {
  if (endpoint === "/api/v1/security/remove-password") return outputs;
  const source = inputs.find((file) => getPdfAccess(file)?.encrypted);
  if (!source) return outputs;
  const access = getPdfAccess(source)!;
  const protectedFiles: File[] = [];
  for (const output of outputs) {
    if (await zipFileService.isZipResponse(output)) {
      const extracted = await zipFileService.extractAllFiles(output);
      if (
        !extracted.success ||
        extracted.errors.length > 0 ||
        extracted.extractedCount !== extracted.totalFiles ||
        extracted.extractedFiles.length === 0
      )
        throw protectionRestoreError();
      const protectedEntries: File[] = [];
      for (const entry of extracted.extractedFiles) {
        protectedEntries.push(await protectPdfOutput(entry, source, access));
      }
      const { zipFile } = await zipFileService.createZipFromFiles(
        protectedEntries,
        output.name,
      );
      protectedFiles.push(zipFile);
    } else {
      protectedFiles.push(await protectPdfOutput(output, source, access));
    }
  }
  return protectedFiles;
}
