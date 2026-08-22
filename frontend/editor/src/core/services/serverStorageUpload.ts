import apiClient from "@app/services/apiClient";
import { fileStorage } from "@app/services/fileStorage";
import {
  buildHistoryBundle,
  buildSharePackage,
} from "@app/services/serverStorageBundle";
import { SharedFileConflictError } from "@app/services/sharedFileSave";
import type { FileId } from "@app/types/file";
import type { StirlingFileStub } from "@app/types/fileContext";

export interface UploadChainOptions {
  // Optimistic-concurrency baseline; when set the server 409s if it moved on.
  baseVersion?: number;
  force?: boolean;
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

function resolveVersion(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function buildUpdateHeaders(
  options: UploadChainOptions | undefined,
): Record<string, string> {
  if (options?.force || typeof options?.baseVersion !== "number") {
    return {};
  }
  return { "If-Match": `"${options.baseVersion}"` };
}

async function putExistingFile(
  existingRemoteId: number,
  formData: FormData,
  options: UploadChainOptions | undefined,
): Promise<{ updatedAt: number; version?: number }> {
  try {
    const response = await apiClient.put(
      `/api/v1/storage/files/${existingRemoteId}`,
      formData,
      { headers: buildUpdateHeaders(options), suppressErrorToast: true } as any,
    );
    return {
      updatedAt: resolveUpdatedAt(response.data?.updatedAt),
      version: resolveVersion(response.data?.version),
    };
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response
      ?.status;
    if (status === 409) {
      throw new SharedFileConflictError();
    }
    throw error;
  }
}

export async function uploadHistoryChain(
  originalFileId: FileId,
  existingRemoteId?: number,
  options?: UploadChainOptions,
): Promise<{
  remoteId: number;
  updatedAt: number;
  version?: number;
  chain: StirlingFileStub[];
}> {
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

  if (existingRemoteId) {
    const { updatedAt, version } = await putExistingFile(
      existingRemoteId,
      formData,
      options,
    );
    return { remoteId: existingRemoteId, updatedAt, version, chain };
  }

  const response = await apiClient.post("/api/v1/storage/files", formData);
  const remoteId = response.data?.id as number | undefined;
  if (!remoteId) {
    throw new Error("Missing stored file ID in response.");
  }

  const updatedAt = resolveUpdatedAt(response.data?.updatedAt);
  return {
    remoteId,
    updatedAt,
    version: resolveVersion(response.data?.version),
    chain,
  };
}

export async function uploadHistoryChains(
  originalFileIds: FileId[],
  existingRemoteId?: number,
  options?: UploadChainOptions,
): Promise<{
  remoteId: number;
  updatedAt: number;
  version?: number;
  chain: StirlingFileStub[];
}> {
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
      if (!seenIds.has(stub.id as FileId)) {
        seenIds.add(stub.id as FileId);
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

  if (existingRemoteId) {
    const { updatedAt, version } = await putExistingFile(
      existingRemoteId,
      formData,
      options,
    );
    return {
      remoteId: existingRemoteId,
      updatedAt,
      version,
      chain: combinedChain,
    };
  }

  const response = await apiClient.post("/api/v1/storage/files", formData);
  const remoteId = response.data?.id as number | undefined;
  if (!remoteId) {
    throw new Error("Missing stored file ID in response.");
  }

  const updatedAt = resolveUpdatedAt(response.data?.updatedAt);
  return {
    remoteId,
    updatedAt,
    version: resolveVersion(response.data?.version),
    chain: combinedChain,
  };
}
