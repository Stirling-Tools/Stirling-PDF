import JSZip from 'jszip';

import { fileStorage } from '@app/services/fileStorage';
import type { FileId, ToolOperation } from '@app/types/file';
import type { StirlingFileStub } from '@app/types/fileContext';

interface ShareBundleEntry {
  logicalId: string;
  rootLogicalId: string;
  parentLogicalId?: string;
  versionNumber: number;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  toolHistory?: ToolOperation[];
  filePath: string;
  isLeaf: boolean;
}

export interface ShareBundleManifest {
  schemaVersion: 1;
  rootLogicalId: string;
  rootLogicalIds: string[];
  createdAt: number;
  entries: ShareBundleEntry[];
}

function sanitizeFilename(name: string): string {
  const trimmed = name?.trim();
  if (!trimmed) return 'file';
  return trimmed.replace(/[\\/:*?"<>|]/g, '_');
}

export async function buildHistoryBundle(originalFileIds: FileId[] | FileId): Promise<{
  bundleFile: File;
  manifest: ShareBundleManifest;
}> {
  const roots = Array.isArray(originalFileIds) ? originalFileIds : [originalFileIds];
  const uniqueRoots = Array.from(new Set(roots));
  const allStubs: Array<{ rootId: FileId; stubs: Awaited<ReturnType<typeof fileStorage.getHistoryChainStubs>> }> = [];

  for (const rootId of uniqueRoots) {
    const stubs = await fileStorage.getHistoryChainStubs(rootId);
    if (stubs.length === 0) {
      throw new Error('No history chain found for file.');
    }
    allStubs.push({ rootId, stubs });
  }

  const zip = new JSZip();
  const entries: ShareBundleEntry[] = [];

  for (const chain of allStubs) {
    for (const stub of chain.stubs) {
      const file = await fileStorage.getStirlingFile(stub.id);
      if (!file) {
        throw new Error(`Missing file data for ${stub.name || stub.id}`);
      }

      const logicalId = stub.id;
      const filePath = `files/${logicalId}/${sanitizeFilename(stub.name || 'file')}`;
      const buffer = await file.arrayBuffer();
      zip.file(filePath, buffer);

      entries.push({
        logicalId,
        rootLogicalId: chain.rootId,
        parentLogicalId: stub.parentFileId,
        versionNumber: stub.versionNumber || 1,
        name: stub.name,
        type: stub.type,
        size: stub.size,
        lastModified: stub.lastModified,
        toolHistory: stub.toolHistory,
        filePath,
        isLeaf: Boolean(stub.isLeaf),
      });
    }
  }

  const manifest: ShareBundleManifest = {
    schemaVersion: 1,
    rootLogicalId: uniqueRoots[0],
    rootLogicalIds: uniqueRoots,
    createdAt: Date.now(),
    entries,
  };

  zip.file('stirling-share.json', JSON.stringify(manifest, null, 2));

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const firstStubName = allStubs[0]?.stubs[0]?.name || 'shared';
  const rootName = sanitizeFilename(firstStubName);
  const bundleFile = new File([zipBlob], `${rootName}-history.zip`, {
    type: 'application/zip',
    lastModified: Date.now(),
  });

  return { bundleFile, manifest };
}

export async function buildSharePackage(
  stubs: StirlingFileStub[]
): Promise<{
  bundleFile: File;
  manifest: ShareBundleManifest;
}> {
  if (stubs.length === 0) {
    throw new Error('No files provided for sharing.');
  }

  const zip = new JSZip();
  const entries: ShareBundleEntry[] = [];

  for (const stub of stubs) {
    const file = await fileStorage.getStirlingFile(stub.id as FileId);
    if (!file) {
      throw new Error(`Missing file data for ${stub.name || stub.id}`);
    }

    const logicalId = stub.id as string;
    const filePath = `files/${logicalId}/${sanitizeFilename(stub.name || 'file')}`;
    const buffer = await file.arrayBuffer();
    zip.file(filePath, buffer);

    entries.push({
      logicalId,
      rootLogicalId: logicalId,
      versionNumber: stub.versionNumber || 1,
      name: stub.name,
      type: stub.type,
      size: stub.size,
      lastModified: stub.lastModified,
      toolHistory: stub.toolHistory,
      filePath,
      isLeaf: true,
    });
  }

  const rootLogicalIds = entries.map((entry) => entry.logicalId);
  const manifest: ShareBundleManifest = {
    schemaVersion: 1,
    rootLogicalId: rootLogicalIds[0],
    rootLogicalIds,
    createdAt: Date.now(),
    entries,
  };

  zip.file('stirling-share.json', JSON.stringify(manifest, null, 2));

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const bundleFile = new File([zipBlob], `shared-files.zip`, {
    type: 'application/zip',
    lastModified: Date.now(),
  });

  return { bundleFile, manifest };
}
