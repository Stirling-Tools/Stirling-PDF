import apiClient from "@editor/services/apiClient";
import {
  readPdfAttachmentBytes,
  readPdfAttachments,
  readPdfAttachmentsWithContent,
} from "@editor/services/pdfiumService";
import axios from "axios";
import JSZip from "jszip";

export interface AttachmentInfo {
  filename: string;
  size?: number;
  contentType?: string;
  description?: string;
  creationDate?: string;
  modificationDate?: string;
}

/**
 * Parse Blob error response bodies from Axios error responses into readable message strings.
 */
export async function parseBlobError(
  error: unknown,
  fallbackMessage: string,
): Promise<string> {
  if (axios.isAxiosError(error) && error.response?.data) {
    const data = error.response.data;
    if (data instanceof Blob) {
      try {
        const text = await data.text();
        if (text) {
          try {
            const json = JSON.parse(text);
            if (json && (json.message || json.error)) {
              return json.message || json.error;
            }
          } catch {
            return text;
          }
        }
      } catch {
        // Ignore blob reading errors and fall back
      }
    } else if (typeof data === "object" && data !== null) {
      const obj = data as Record<string, unknown>;
      if (obj.message && typeof obj.message === "string") return obj.message;
      if (obj.error && typeof obj.error === "string") return obj.error;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallbackMessage;
}

/**
 * List all embedded attachments in a PDF file.
 *
 * Reads the local document with PDFium so the table renders without uploading
 * the file; renames and deletions are staged client-side until save.
 */
export async function listAttachments(
  fileInput: File,
): Promise<AttachmentInfo[]> {
  const attachments = await readPdfAttachments(await fileInput.arrayBuffer());
  return attachments.map((attachment) => ({
    filename: attachment.name,
    size: attachment.size,
    contentType: attachment.mimeType || undefined,
    description: attachment.description || undefined,
    creationDate: attachment.creationDate?.toISOString(),
  }));
}

/**
 * Rename an embedded attachment in a PDF file.
 * Returns the modified PDF Blob.
 */
export async function renameAttachment(
  fileInput: File,
  attachmentName: string,
  newName: string,
): Promise<Blob> {
  const formData = new FormData();
  formData.append("fileInput", fileInput);
  formData.append("attachmentName", attachmentName);
  formData.append("newName", newName);

  const response = await apiClient.post(
    "/api/v1/misc/rename-attachment",
    formData,
    { responseType: "blob" },
  );
  return response.data as Blob;
}

/**
 * Delete an embedded attachment from a PDF file.
 * Returns the modified PDF Blob.
 */
export async function deleteAttachment(
  fileInput: File,
  attachmentName: string,
): Promise<Blob> {
  const formData = new FormData();
  formData.append("fileInput", fileInput);
  formData.append("attachmentName", attachmentName);

  const response = await apiClient.post(
    "/api/v1/misc/delete-attachment",
    formData,
    { responseType: "blob" },
  );
  return response.data as Blob;
}

/**
 * Reduce an attachment name to one leaf name, so extracting the archive cannot
 * write outside the user's chosen folder.
 */
function safeZipEntryName(name: string): string {
  const leaf = name.split(/[\\/]/).pop()?.trim() ?? "";
  return leaf && leaf !== "." && leaf !== ".." ? leaf : "attachment";
}

/**
 * Match the server's extract-all naming: duplicate file specification names get
 * `_1`, `_2`, … before the extension instead of overwriting each other in JSZip.
 */
function uniqueZipEntryName(name: string, usedNames: Set<string>): string {
  const dot = name.lastIndexOf(".");
  const hasExtension = dot > 0 && dot < name.length - 1;
  const base = hasExtension ? name.slice(0, dot) : name;
  const extension = hasExtension ? name.slice(dot) : "";
  let candidate = name;
  let counter = 1;
  while (usedNames.has(candidate)) {
    candidate = `${base}_${counter}${extension}`;
    counter++;
  }
  usedNames.add(candidate);
  return candidate;
}

/**
 * Extract all embedded attachments from a PDF into a ZIP archive.
 * Reads the local document with PDFium; nothing is uploaded.
 */
export async function extractAttachments(fileInput: File): Promise<Blob> {
  const entries = await readPdfAttachmentsWithContent(
    await fileInput.arrayBuffer(),
  );
  const zip = new JSZip();
  const usedNames = new Set<string>();
  for (const { attachment, bytes } of entries) {
    zip.file(
      uniqueZipEntryName(safeZipEntryName(attachment.name), usedNames),
      bytes,
    );
  }
  return zip.generateAsync({ type: "blob" });
}

/**
 * Extract a single embedded attachment from a PDF file.
 * Returns the attachment Blob.
 */
export async function extractSingleAttachment(
  fileInput: File,
  filename: string,
): Promise<Blob> {
  const data = await fileInput.arrayBuffer();
  const attachments = await readPdfAttachments(data);
  const cleanFilename = filename.trim();
  const match =
    attachments.find((attachment) => attachment.name === cleanFilename) ??
    attachments.find(
      (attachment) =>
        attachment.name.toLowerCase() === cleanFilename.toLowerCase(),
    );

  if (!match) {
    throw new Error(`Attachment file '${filename}' not found in the PDF.`);
  }

  const bytes = await readPdfAttachmentBytes(data, match.index);
  return new Blob([bytes], {
    type: match.mimeType || "application/octet-stream",
  });
}

/**
 * Add attachments to a PDF file.
 * Returns the modified PDF Blob.
 */
export async function addAttachments(
  fileInput: File,
  attachments: File[],
  convertToPdfA3b?: boolean,
): Promise<Blob> {
  const formData = new FormData();
  formData.append("fileInput", fileInput);
  attachments.forEach((att) => {
    formData.append("attachments", att);
  });
  if (convertToPdfA3b) {
    formData.append("convertToPdfA3b", "true");
  }

  const response = await apiClient.post(
    "/api/v1/misc/add-attachments",
    formData,
    { responseType: "blob" },
  );
  return response.data as Blob;
}

/**
 * Apply queued batch operations (renames, deletions, additions) in a single pass via backend endpoint.
 * Unknown rename or delete targets are skipped server-side; re-list afterwards to reconcile.
 */
export async function applyBatchAttachmentOps(
  fileInput: File,
  ops: {
    renames: { oldName: string; newName: string }[];
    deletions: string[];
    additions: File[];
    convertToPdfA3b?: boolean;
  },
): Promise<Blob> {
  const formData = new FormData();
  formData.append("fileInput", fileInput);
  formData.append(
    "opsJson",
    JSON.stringify({
      renames: ops.renames,
      deletions: ops.deletions,
    }),
  );
  ops.additions.forEach((att) => {
    formData.append("attachments", att);
  });
  if (ops.convertToPdfA3b) {
    formData.append("convertToPdfA3b", "true");
  }

  try {
    const response = await apiClient.post(
      "/api/v1/misc/batch-process-attachments",
      formData,
      { responseType: "blob" },
    );
    return response.data as Blob;
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    if (status !== 404 && status !== 501) {
      throw err;
    }
    // Client-side sequential fallback if running against legacy server
    let currentFile: File = fileInput;
    for (const { oldName, newName } of ops.renames) {
      const blob = await renameAttachment(currentFile, oldName, newName);
      currentFile = new File([blob], currentFile.name, {
        type: currentFile.type || "application/pdf",
        lastModified: Date.now(),
      });
    }
    for (const name of ops.deletions) {
      const blob = await deleteAttachment(currentFile, name);
      currentFile = new File([blob], currentFile.name, {
        type: currentFile.type || "application/pdf",
        lastModified: Date.now(),
      });
    }
    if (ops.additions.length > 0) {
      return await addAttachments(
        currentFile,
        ops.additions,
        ops.convertToPdfA3b,
      );
    }
    return currentFile;
  }
}
