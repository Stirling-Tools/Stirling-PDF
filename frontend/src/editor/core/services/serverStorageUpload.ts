import apiClient from "@editor/services/apiClient";
import {
  assertFilesNotBlocked,
  policySourceIds,
} from "@editor/services/policyFileGuard";
import { fileStorage } from "@editor/services/fileStorage";
import {
  buildHistoryBundle,
  buildSharePackage,
} from "@editor/services/serverStorageBundle";
import type { FileId, RemoteSyncBase } from "@editor/types/file";
import type { StirlingFileStub } from "@editor/types/fileContext";

export interface ChainUploadResult {
  remoteId: number;
  updatedAt: number;
  chain: StirlingFileStub[];
  /** Absent when the server does not report revisions. */
  remoteSync?: RemoteSyncBase;
}

export interface ChainUploadOptions {
  /** Refuse the update (HTTP 409) unless the server copy is still at this revision. */
  expectedRevision?: string;
  /** Leave failures to the caller instead of the global error toast. */
  quiet?: boolean;
}

function resolveUpdatedAt(value: unknown): number {
  if (!value) {
    return Date.now();
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Date.now();
  }
  const parsed = new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

/** Older servers omit revision tokens; their uploads must not establish an automatic-sync base. */
function syncBaseFrom(
  data: { revision?: unknown } | undefined,
  leafId: FileId,
): RemoteSyncBase | undefined {
  return typeof data?.revision === "string"
    ? { revision: data.revision, leafId }
    : undefined;
}

/**
 * Uploads the selected history chain and its audit bundle; an existing remote ID selects
 * replacement. A supplied expected revision rejects stale writes instead of overwriting.
 * Returns the uploaded leaf's sync base but leaves local metadata persistence to the caller.
 */
export async function uploadHistoryChain(
  originalFileId: FileId,
  existingRemoteId?: number,
  options: ChainUploadOptions = {},
): Promise<ChainUploadResult> {
  assertFilesNotBlocked([originalFileId]);
  const chain = await fileStorage.getHistoryChainStubs(originalFileId);
  if (chain.length === 0) {
    throw new Error("No history chain found.");
  }

  const finalStub =
    chain
      .slice()
      .reverse()
      .find((stub) => stub.isLeaf !== false) || chain[chain.length - 1];
  const finalFile = await fileStorage.getStirlingFile(finalStub.id);
  if (!finalFile) {
    throw new Error("Missing final file data for sharing.");
  }

  const { bundleFile, manifest } = await buildHistoryBundle(originalFileId);
  const auditLog = new File(
    [JSON.stringify(manifest, null, 2)],
    "audit-log.json",
    {
      type: "application/json",
      lastModified: Date.now(),
    },
  );
  const formData = new FormData();
  formData.append("file", finalFile, finalFile.name);
  formData.append("historyBundle", bundleFile, bundleFile.name);
  formData.append("auditLog", auditLog, auditLog.name);
  assertFilesNotBlocked(chain.flatMap(policySourceIds));

  const requestConfig = {
    suppressErrorToast: options.quiet,
    params: options.expectedRevision
      ? { baseRevision: options.expectedRevision }
      : undefined,
  };

  if (existingRemoteId) {
    const response = await apiClient.put(
      `/api/v1/storage/files/${existingRemoteId}`,
      formData,
      requestConfig,
    );
    const updatedAt = resolveUpdatedAt(response.data?.updatedAt);
    return {
      remoteId: existingRemoteId,
      updatedAt,
      chain,
      remoteSync: syncBaseFrom(response.data, finalStub.id),
    };
  }

  const response = await apiClient.post(
    "/api/v1/storage/files",
    formData,
    requestConfig,
  );
  const remoteId = response.data?.id as number | undefined;
  if (!remoteId) {
    throw new Error("Missing stored file ID in response.");
  }

  const updatedAt = resolveUpdatedAt(response.data?.updatedAt);
  return {
    remoteId,
    updatedAt,
    chain,
    remoteSync: syncBaseFrom(response.data, finalStub.id),
  };
}

/**
 * Records a finished upload on `stubs`, in memory and in IndexedDB. Pass every
 * stub of the document that exists now, not just the uploaded chain: a version
 * made while the upload ran must inherit the new base, or its next update is
 * checked against a revision the server has already replaced.
 */
export async function recordChainUpload(
  result: ChainUploadResult,
  stubs: StirlingFileStub[],
  updateStub: (id: FileId, updates: Partial<StirlingFileStub>) => void,
  extra: Partial<StirlingFileStub> = {},
): Promise<void> {
  const updates: Partial<StirlingFileStub> = {
    remoteStorageId: result.remoteId,
    remoteStorageUpdatedAt: result.updatedAt,
    remoteOwnedByCurrentUser: true,
    remoteSync: result.remoteSync,
    ...extra,
  };
  for (const stub of stubs) {
    updateStub(stub.id, updates);
    await fileStorage.updateFileMetadata(stub.id, updates);
  }
}

export async function uploadHistoryChains(
  originalFileIds: FileId[],
  existingRemoteId?: number,
): Promise<{ remoteId: number; updatedAt: number; chain: StirlingFileStub[] }> {
  assertFilesNotBlocked(originalFileIds);
  const uniqueRoots = Array.from(new Set(originalFileIds));
  const chainMap = new Map<FileId, StirlingFileStub[]>();
  const combinedChain: StirlingFileStub[] = [];
  const seenIds = new Set<FileId>();
  const leafStubs: StirlingFileStub[] = [];

  for (const rootId of uniqueRoots) {
    const chain = await fileStorage.getHistoryChainStubs(rootId);
    if (chain.length === 0) {
      throw new Error("No history chain found.");
    }
    chainMap.set(rootId, chain);
    const finalStub =
      chain
        .slice()
        .reverse()
        .find((stub) => stub.isLeaf !== false) || chain[chain.length - 1];
    if (finalStub) {
      leafStubs.push(finalStub);
    }
    for (const stub of chain) {
      if (!seenIds.has(stub.id)) {
        seenIds.add(stub.id);
        combinedChain.push(stub);
      }
    }
  }

  let shareFile: File;
  if (leafStubs.length === 1) {
    const finalFile = await fileStorage.getStirlingFile(leafStubs[0].id);
    if (!finalFile) {
      throw new Error("Missing final file data for sharing.");
    }
    shareFile = finalFile;
  } else {
    const { bundleFile } = await buildSharePackage(leafStubs);
    shareFile = bundleFile;
  }

  const { bundleFile, manifest } = await buildHistoryBundle(uniqueRoots);
  const auditLog = new File(
    [JSON.stringify(manifest, null, 2)],
    "audit-log.json",
    {
      type: "application/json",
      lastModified: Date.now(),
    },
  );
  const formData = new FormData();
  formData.append("file", shareFile, shareFile.name);
  formData.append("historyBundle", bundleFile, bundleFile.name);
  formData.append("auditLog", auditLog, auditLog.name);
  assertFilesNotBlocked(combinedChain.flatMap(policySourceIds));

  if (existingRemoteId) {
    const response = await apiClient.put(
      `/api/v1/storage/files/${existingRemoteId}`,
      formData,
    );
    const updatedAt = resolveUpdatedAt(response.data?.updatedAt);
    return { remoteId: existingRemoteId, updatedAt, chain: combinedChain };
  }

  const response = await apiClient.post("/api/v1/storage/files", formData);
  const remoteId = response.data?.id as number | undefined;
  if (!remoteId) {
    throw new Error("Missing stored file ID in response.");
  }

  const updatedAt = resolveUpdatedAt(response.data?.updatedAt);
  return { remoteId, updatedAt, chain: combinedChain };
}
