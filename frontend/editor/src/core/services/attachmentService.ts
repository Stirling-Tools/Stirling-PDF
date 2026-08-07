import apiClient from "@app/services/apiClient";
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
 * Middle-truncate long filenames while preserving file extensions.
 * Example: "Season of Storms - Andrzej Sapkowski (2013)_converted.pdf" -> "Season of Sto..._converted.pdf"
 */
export function truncateMiddle(
  filename: string,
  maxLength: number = 26,
): string {
  if (!filename || filename.length <= maxLength) return filename;

  const lastDotIndex = filename.lastIndexOf(".");
  let ext = "";
  let nameWithoutExt = filename;

  if (lastDotIndex > 0 && lastDotIndex < filename.length - 1) {
    ext = filename.slice(lastDotIndex);
    nameWithoutExt = filename.slice(0, lastDotIndex);
  }

  const availableNameLen = maxLength - ext.length - 3; // 3 for "..."
  if (availableNameLen < 4) {
    return filename.slice(0, maxLength - 3) + "...";
  }

  const frontLen = Math.ceil(availableNameLen / 2);
  const backLen = Math.floor(availableNameLen / 2);

  return (
    nameWithoutExt.slice(0, frontLen) +
    "..." +
    nameWithoutExt.slice(nameWithoutExt.length - backLen) +
    ext
  );
}

/**
 * Format bytes into human-readable size string (B, KB, MB).
 */
export function formatFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
 */
export async function listAttachments(
  fileInput: File,
): Promise<AttachmentInfo[]> {
  const formData = new FormData();
  formData.append("fileInput", fileInput);

  const response = await apiClient.post<AttachmentInfo[]>(
    "/api/v1/misc/list-attachments",
    formData,
  );
  return response.data || [];
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
 * Extract all embedded attachments from a PDF into a ZIP archive.
 * Returns the ZIP Blob.
 */
export async function extractAttachments(fileInput: File): Promise<Blob> {
  const formData = new FormData();
  formData.append("fileInput", fileInput);

  const response = await apiClient.post(
    "/api/v1/misc/extract-attachments",
    formData,
    { responseType: "blob" },
  );
  return response.data as Blob;
}

/**
 * Extract a single embedded attachment from a PDF file directly from the server.
 * Returns the attachment Blob.
 */
export async function extractSingleAttachment(
  fileInput: File,
  filename: string,
): Promise<Blob> {
  const formData = new FormData();
  formData.append("fileInput", fileInput);
  formData.append("attachmentName", filename);

  try {
    const response = await apiClient.post(
      "/api/v1/misc/extract-single-attachment",
      formData,
      { responseType: "blob" },
    );
    return response.data as Blob;
  } catch {
    // Client-side JSZip fallback if running against legacy backend
    const zipBlob = await extractAttachments(fileInput);
    const zip = await JSZip.loadAsync(zipBlob);
    const cleanFilename = filename.trim();
    const fileEntries = Object.keys(zip.files).filter((k) => !zip.files[k].dir);
    let matchedKey = fileEntries.find((k) => k === cleanFilename);
    if (!matchedKey) {
      const norm = (s: string) =>
        decodeURIComponent(s).toLowerCase().replace(/\\/g, "/");
      const targetNorm = norm(cleanFilename);
      const targetBase = targetNorm.split("/").pop() || targetNorm;
      matchedKey = fileEntries.find((k) => {
        const kNorm = norm(k);
        const kBase = kNorm.split("/").pop() || kNorm;
        return (
          kNorm === targetNorm ||
          kBase === targetBase ||
          kNorm.endsWith("/" + targetBase)
        );
      });
    }
    const zipEntry = matchedKey ? zip.file(matchedKey) : null;
    if (!zipEntry) {
      throw new Error(`Attachment file '${filename}' not found in archive.`);
    }
    return await zipEntry.async("blob");
  }
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
 * Apply queued batch operations (renames, deletions, additions) in a single atomic pass via backend endpoint.
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
  } catch {
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
    if (ops.additions.length > 0 || ops.convertToPdfA3b) {
      return await addAttachments(
        currentFile,
        ops.additions,
        ops.convertToPdfA3b,
      );
    }
    return currentFile;
  }
}
