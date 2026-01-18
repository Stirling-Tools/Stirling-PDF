import apiClient from '@app/services/apiClient';
import { fileStorage } from '@app/services/fileStorage';
import { buildHistoryBundle, buildSharePackage } from '@app/services/serverStorageBundle';
import type { FileId } from '@app/types/file';
import type { StirlingFileStub } from '@app/types/fileContext';

function resolveUpdatedAt(value: unknown): number {
  if (!value) {
    return Date.now();
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : Date.now();
  }
  const parsed = new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export async function uploadHistoryChain(
  originalFileId: FileId,
  existingRemoteId?: number
): Promise<{ remoteId: number; updatedAt: number; chain: StirlingFileStub[] }> {
  const chain = await fileStorage.getHistoryChainStubs(originalFileId);
  if (chain.length === 0) {
    throw new Error('No history chain found.');
  }

  const finalStub =
    chain.slice().reverse().find((stub) => stub.isLeaf !== false) || chain[chain.length - 1];
  const finalFile = await fileStorage.getStirlingFile(finalStub.id);
  if (!finalFile) {
    throw new Error('Missing final file data for sharing.');
  }

  const { bundleFile, manifest } = await buildHistoryBundle(originalFileId);
  const auditLog = new File([JSON.stringify(manifest, null, 2)], 'audit-log.json', {
    type: 'application/json',
    lastModified: Date.now(),
  });
  const formData = new FormData();
  formData.append('file', finalFile, finalFile.name);
  formData.append('historyBundle', bundleFile, bundleFile.name);
  formData.append('auditLog', auditLog, auditLog.name);

  if (existingRemoteId) {
    const response = await apiClient.put(`/api/v1/storage/files/${existingRemoteId}`, formData);
    const updatedAt = resolveUpdatedAt(response.data?.updatedAt);
    return { remoteId: existingRemoteId, updatedAt, chain };
  }

  const response = await apiClient.post('/api/v1/storage/files', formData);
  const remoteId = response.data?.id as number | undefined;
  if (!remoteId) {
    throw new Error('Missing stored file ID in response.');
  }

  const updatedAt = resolveUpdatedAt(response.data?.updatedAt);
  return { remoteId, updatedAt, chain };
}

export async function uploadHistoryChains(
  originalFileIds: FileId[],
  existingRemoteId?: number
): Promise<{ remoteId: number; updatedAt: number; chain: StirlingFileStub[] }> {
  const uniqueRoots = Array.from(new Set(originalFileIds));
  const chainMap = new Map<FileId, StirlingFileStub[]>();
  const combinedChain: StirlingFileStub[] = [];
  const seenIds = new Set<FileId>();
  const leafStubs: StirlingFileStub[] = [];

  for (const rootId of uniqueRoots) {
    const chain = await fileStorage.getHistoryChainStubs(rootId);
    if (chain.length === 0) {
      throw new Error('No history chain found.');
    }
    chainMap.set(rootId, chain);
    const finalStub =
      chain.slice().reverse().find((stub) => stub.isLeaf !== false) || chain[chain.length - 1];
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
      throw new Error('Missing final file data for sharing.');
    }
    shareFile = finalFile;
  } else {
    const { bundleFile } = await buildSharePackage(leafStubs);
    shareFile = bundleFile;
  }

  const { bundleFile, manifest } = await buildHistoryBundle(uniqueRoots);
  const auditLog = new File([JSON.stringify(manifest, null, 2)], 'audit-log.json', {
    type: 'application/json',
    lastModified: Date.now(),
  });
  const formData = new FormData();
  formData.append('file', shareFile, shareFile.name);
  formData.append('historyBundle', bundleFile, bundleFile.name);
  formData.append('auditLog', auditLog, auditLog.name);

  if (existingRemoteId) {
    const response = await apiClient.put(`/api/v1/storage/files/${existingRemoteId}`, formData);
    const updatedAt = resolveUpdatedAt(response.data?.updatedAt);
    return { remoteId: existingRemoteId, updatedAt, chain: combinedChain };
  }

  const response = await apiClient.post('/api/v1/storage/files', formData);
  const remoteId = response.data?.id as number | undefined;
  if (!remoteId) {
    throw new Error('Missing stored file ID in response.');
  }

  const updatedAt = resolveUpdatedAt(response.data?.updatedAt);
  return { remoteId, updatedAt, chain: combinedChain };
}
