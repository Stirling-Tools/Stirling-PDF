import apiClient from "@app/services/apiClient";
import i18n from "i18next";
import {
  getPdfAccess,
  rememberPdfAccess,
  type PdfAccess,
} from "@app/services/pdfPasswordStore";
import type { StirlingFile } from "@app/types/fileContext";

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
  const response = await apiClient.post<Omit<PdfAccess, "password">>(
    "/api/v1/security/inspect-pdf-security",
    form,
    { suppressErrorToast: true },
  );
  const access = { ...response.data, password };
  return access;
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

/** Restore protection before a PDF can reach downloads or storage. For merges, the first protected input defines output protection. */
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
