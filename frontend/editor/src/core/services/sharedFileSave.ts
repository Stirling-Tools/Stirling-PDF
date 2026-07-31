// Write-back for files shared WITH the current user (editor role). Sends only
// main bytes (owner's history/audit stay untouched); If-Match guards concurrency.

import apiClient from "@app/services/apiClient";
import { fileStorage } from "@app/services/fileStorage";
import type { FileId } from "@app/types/file";
import type { StirlingFileStub } from "@app/types/fileContext";

/** Thrown when the server copy moved on since our bytes were fetched (HTTP 409). */
export class SharedFileConflictError extends Error {
  constructor() {
    super("Shared file was modified by someone else");
    this.name = "SharedFileConflictError";
  }
}

export interface SharedSaveResult {
  version?: number;
  updatedAt: number;
}

function resolveUpdatedAt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value) {
    const parsed = new Date(String(value)).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

async function resolveLeafFile(stub: StirlingFileStub): Promise<File> {
  const originalFileId = (stub.originalFileId || stub.id) as FileId;
  const chain = await fileStorage.getHistoryChainStubs(originalFileId);
  const finalStub =
    chain
      .slice()
      .reverse()
      .find((entry) => entry.isLeaf !== false) ||
    chain[chain.length - 1] ||
    stub;
  const finalFile = await fileStorage.getStirlingFile(finalStub.id);
  if (!finalFile) {
    throw new Error("Missing local file data for shared save.");
  }
  return finalFile;
}

function isConflict(error: unknown): boolean {
  return (
    (error as { response?: { status?: number } })?.response?.status === 409
  );
}

// Save the local latest bytes back to the shared server file; force=true skips
// the version check (deliberate overwrite after a conflict).
export async function saveSharedFile(
  stub: StirlingFileStub,
  options?: { force?: boolean },
): Promise<SharedSaveResult> {
  const file = await resolveLeafFile(stub);
  const formData = new FormData();
  formData.append("file", file, file.name);

  const baseVersion = stub.remoteVersionBase;
  const headers: Record<string, string> = {};
  if (!options?.force && typeof baseVersion === "number") {
    headers["If-Match"] = `"${baseVersion}"`;
  }

  const useToken = Boolean(stub.remoteSharedViaLink && stub.remoteShareToken);
  const url = useToken
    ? `/api/v1/storage/share-links/${stub.remoteShareToken}`
    : `/api/v1/storage/files/${stub.remoteStorageId}`;
  if (!useToken && !stub.remoteStorageId) {
    throw new Error("Shared file has no server reference.");
  }

  try {
    const response = await apiClient.put(url, formData, {
      headers,
      suppressErrorToast: true,
    } as any);
    const version =
      typeof response.data?.version === "number"
        ? response.data.version
        : undefined;
    return { version, updatedAt: resolveUpdatedAt(response.data?.updatedAt) };
  } catch (error) {
    if (isConflict(error)) {
      throw new SharedFileConflictError();
    }
    throw error;
  }
}

/** Download the current server bytes for a shared stub (token or file id path). */
export async function downloadSharedBytes(
  stub: StirlingFileStub,
): Promise<Blob> {
  const url =
    stub.remoteSharedViaLink && stub.remoteShareToken
      ? `/api/v1/storage/share-links/${stub.remoteShareToken}`
      : `/api/v1/storage/files/${stub.remoteStorageId}/download`;
  const response = await apiClient.get(url, {
    responseType: "blob",
    suppressErrorToast: true,
  } as any);
  return response.data as Blob;
}

/** Latest server version for a shared stub; null when it can't be determined. */
export async function fetchLatestSharedVersion(
  stub: StirlingFileStub,
): Promise<number | null> {
  try {
    if (stub.remoteSharedViaLink && stub.remoteShareToken) {
      const response = await apiClient.get(
        `/api/v1/storage/share-links/${stub.remoteShareToken}/metadata`,
        { suppressErrorToast: true, skipAuthRedirect: true } as any,
      );
      const version = response.data?.version;
      return typeof version === "number" ? version : null;
    }
    if (stub.remoteStorageId) {
      const response = await apiClient.get(
        `/api/v1/storage/files/${stub.remoteStorageId}`,
        { suppressErrorToast: true, skipAuthRedirect: true } as any,
      );
      const version = response.data?.version;
      return typeof version === "number" ? version : null;
    }
  } catch {
    // Metadata refresh is best-effort; the save itself still conflict-checks.
  }
  return null;
}
