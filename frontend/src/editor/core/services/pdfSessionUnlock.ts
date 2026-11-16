import {
  ensureLocalPdfAccess,
  getPdfAccess,
  pdfAccessLifetime,
  rememberPdfAccess,
  type PdfAccess,
} from "@editor/services/pdfAccessService";
import apiClient from "@editor/services/apiClient";
import axios, { type CancelToken } from "axios";
import i18n from "i18next";

import type { StirlingFile } from "@editor/types/fileContext";
import { PdfPermissionFlag } from "@embedpdf/models";
import { zipFileService } from "@editor/services/zipFileService";

import {
  hasPdfPermissionOverride,
  pdfAllows,
} from "@editor/services/pdfPermissions";
import { isDamagedPdfError } from "@editor/utils/pdfDamage";
import { looksEncryptedFromTrailer } from "@editor/utils/pdfEncryptionProbe";

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
  cancelToken?: CancelToken,
  signal?: AbortSignal,
): Promise<Blob> {
  try {
    const response = await apiClient.post<Blob>(endpoint, form, {
      responseType: "blob",
      suppressErrorToast: true,
      cancelToken,
      signal,
    });
    return response.data;
  } catch (error) {
    // Axios errors carry the password-bearing request form into tool logs and failure history.
    const sanitized = axios.isCancel(error)
      ? new axios.CanceledError("Operation cancelled")
      : new Error(message);
    throw sanitized;
  }
}

/** These interactive operations restore protection before exposing or persisting any result. */
export function supportsSessionUnlock(endpoint: string | undefined): boolean {
  return endpoint !== undefined && SUPPORTED_ENDPOINTS.has(endpoint);
}

/**
 * PDFium rejects some damaged files the server can still recover, so unparseable
 * bytes with no encryption hint are passed through unchanged. Access is not
 * recorded for them: nothing has proved them unencrypted.
 */
async function ensureAccessUnlessDamaged(
  file: StirlingFile,
  signal?: AbortSignal,
): Promise<PdfAccess | undefined> {
  try {
    return await ensureLocalPdfAccess(file, signal);
  } catch (error) {
    if (isDamagedPdfError(error) && !(await looksEncryptedFromTrailer(file)))
      return undefined;
    throw error;
  }
}

/** Checks the whole selection before processing; encryption hints request authentication but never grant access. */
export async function preflightPdfOperation(
  files: readonly StirlingFile[],
  endpoint: string | undefined,
  combinesFiles: boolean,
  requestOwner: (file: StirlingFile) => Promise<boolean>,
  signal?: AbortSignal,
  isKnownEncrypted: (file: StirlingFile) => boolean = () => false,
): Promise<boolean> {
  const protectedFiles: StirlingFile[] = [];
  const changesProtection =
    endpoint === "/api/v1/security/add-password" ||
    endpoint === "/api/v1/security/remove-password";
  for (const file of files) {
    if (signal?.aborted) throw new axios.CanceledError("Operation cancelled");
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) continue;
    // Password endpoints validate the requested change themselves; unknown roles need no preflight upload.
    const access = changesProtection
      ? getPdfAccess(file)
      : await ensureAccessUnlessDamaged(file, signal);
    const encrypted =
      access?.encrypted ??
      (endpoint === "/api/v1/security/add-password" && isKnownEncrypted(file));
    if (!encrypted) continue;
    if (!supportsSessionUnlock(endpoint))
      throw new Error(
        i18n.t(
          "encryptedPdfUnlock.unsupportedTool",
          "This tool cannot yet preserve this PDF's protection.",
        ),
      );
    if (access?.signed)
      throw new Error(
        i18n.t(
          "encryptedPdfUnlock.signedReadOnly",
          "This signed PDF can be viewed, but cannot be edited here.",
        ),
      );
    protectedFiles.push(file);
  }
  if (combinesFiles && protectedFiles.length > 1)
    throw new Error(
      i18n.t(
        "encryptedPdfUnlock.mixedProtection",
        "These PDFs have separate protection settings. Process them individually.",
      ),
    );
  for (const file of protectedFiles) {
    if (signal?.aborted) throw new axios.CanceledError("Operation cancelled");
    if (endpoint === "/api/v1/security/remove-password") continue;
    const access = getPdfAccess(file);
    const needsOwner = endpoint?.includes("password")
      ? !hasPdfPermissionOverride(access)
      : !pdfAllows(access, operationPermission(endpoint));
    if (needsOwner && !(await requestOwner(file))) return false;
  }
  if (signal?.aborted) throw new axios.CanceledError("Operation cancelled");
  return true;
}

function operationPermission(endpoint: string | undefined): PdfPermissionFlag {
  return endpoint === "/api/v1/misc/compress-pdf"
    ? PdfPermissionFlag.ModifyContents
    : endpoint?.includes("split")
      ? PdfPermissionFlag.CopyContents
      : PdfPermissionFlag.AssembleDocument;
}

/** Signed protected PDFs remain view-only until their edits can preserve signatures. */
export function assertPdfSessionEditable(access: PdfAccess | undefined): void {
  if (access?.encrypted && access.signed)
    throw new Error(
      i18n.t(
        "encryptedPdfUnlock.signedReadOnly",
        "This PDF has digital signatures. Session unlocking supports viewing it, but processing signed PDFs is not supported yet.",
      ),
    );
  if (access?.encrypted && !pdfAllows(access, PdfPermissionFlag.ModifyContents))
    throw new Error(
      i18n.t(
        "encryptedPdfUnlock.restrictedOperation",
        "This action requires the permissions password.",
      ),
    );
}

/**
 * Decrypted bytes belong only to this operation, never FileContext or persistence.
 * Navigation cancels fresh permission reads; preparation stops on explicit cancellation or source closure.
 */
export async function prepareUnlockedFile(
  file: StirlingFile,
  endpoint: string | undefined,
  inspectionSignal?: AbortSignal,
  cancelToken?: CancelToken,
): Promise<File> {
  if (
    endpoint === "/api/v1/security/remove-password" ||
    endpoint === "/api/v1/security/add-password"
  )
    return file;
  if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name))
    return file;
  const access =
    getPdfAccess(file) ??
    (await ensureAccessUnlessDamaged(file, inspectionSignal));
  if (!access?.encrypted) return file;
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
  const permission = operationPermission(endpoint);
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
    cancelToken,
    pdfAccessLifetime(file),
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

/** Restore protection before results reach downloads or storage, including every PDF in a ZIP; mixed protected inputs are unsupported. */
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

/** Session credentials authenticate the source without selecting which passwords to remove. */
export async function changePdfSecurity(
  file: File,
  form: FormData,
  endpoint: string,
  cancelToken?: CancelToken,
): Promise<Blob> {
  const settingProtection = endpoint === "/api/v1/security/add-password";
  const access = getPdfAccess(file);
  if (settingProtection) {
    if (access?.encrypted && !hasPdfPermissionOverride(access))
      throw new Error(
        i18n.t(
          "encryptedPdfUnlock.ownerRequired",
          "Enter the permissions password to allow restricted actions.",
        ),
      );
    form.set("sourcePassword", access?.password ?? "");
    if (!form.has("keyLength")) {
      form.set("preserveExisting", "true");
      form.delete("password");
      if (access?.openingPassword !== undefined)
        form.set("password", access.openingPassword);
    }
  } else {
    if (
      form.get("ownerPassword") &&
      !form.get("password") &&
      access?.requiresOpeningPassword &&
      access.openingPassword === undefined
    ) {
      throw new Error(
        i18n.t(
          "removePassword.openWithReaderFirst",
          "Reopen this PDF using its opening password before removing only the permissions password.",
        ),
      );
    }
    form.set(
      "sourcePassword",
      access?.password || String(form.get("password") ?? ""),
    );
    if (access?.openingPassword !== undefined)
      form.set("retainedOpeningPassword", access.openingPassword);
  }
  return requestWorkingPdf(
    endpoint,
    form,
    i18n.t(
      "encryptedPdfUnlock.securityChangeFailed",
      "Unable to change protection. Check the permissions password and the new security settings.",
    ),
    cancelToken,
    pdfAccessLifetime(file),
  );
}
