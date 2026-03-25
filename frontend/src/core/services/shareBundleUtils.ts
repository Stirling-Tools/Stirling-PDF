import JSZip from 'jszip';

import type { ShareBundleManifest } from '@app/services/serverStorageBundle';

const MANIFEST_FILENAME = 'stirling-share.json';

export function parseContentDispositionFilename(disposition?: string): string | null {
  if (!disposition) return null;
  const filenameMatch = /filename="([^"]+)"/i.exec(disposition);
  if (filenameMatch?.[1]) return filenameMatch[1];
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  return null;
}

export function isZipBundle(contentType: string, filename: string): boolean {
  return contentType.includes('zip') || filename.toLowerCase().endsWith('.zip');
}

export function getShareBundleEntryRootId(
  manifest: ShareBundleManifest,
  entry: ShareBundleManifest['entries'][number]
): string {
  return entry.rootLogicalId || manifest.rootLogicalId;
}

export function resolveShareBundleOrder(manifest: ShareBundleManifest): {
  rootOrder: string[];
  sortedEntries: ShareBundleManifest['entries'];
} {
  const entryRootId = (entry: ShareBundleManifest['entries'][number]) =>
    getShareBundleEntryRootId(manifest, entry);
  const rootOrder =
    manifest.rootLogicalIds && manifest.rootLogicalIds.length > 0
      ? manifest.rootLogicalIds
      : Array.from(new Set(manifest.entries.map(entryRootId)));
  const sortedEntries: ShareBundleManifest['entries'] = [];
  for (const rootId of rootOrder) {
    const rootEntries = manifest.entries
      .filter((entry) => entryRootId(entry) === rootId)
      .sort((a, b) => a.versionNumber - b.versionNumber);
    sortedEntries.push(...rootEntries);
  }
  return { rootOrder, sortedEntries };
}

export async function loadShareBundleEntries(
  blob: Blob
): Promise<{
  manifest: ShareBundleManifest;
  rootOrder: string[];
  sortedEntries: ShareBundleManifest['entries'];
  files: File[];
} | null> {
  const zip = await JSZip.loadAsync(blob);
  const manifestEntry = zip.file(MANIFEST_FILENAME);
  if (!manifestEntry) {
    return null;
  }

  const manifestText = await manifestEntry.async('text');
  const manifest = JSON.parse(manifestText) as ShareBundleManifest;
  const { rootOrder, sortedEntries } = resolveShareBundleOrder(manifest);

  const files: File[] = [];
  for (const entry of sortedEntries) {
    const zipEntry = zip.file(entry.filePath);
    if (!zipEntry) {
      throw new Error(`Missing file entry ${entry.filePath}`);
    }
    const fileBlob = await zipEntry.async('blob');
    files.push(
      new File([fileBlob], entry.name, {
        type: entry.type,
        lastModified: entry.lastModified,
      })
    );
  }

  return { manifest, rootOrder, sortedEntries, files };
}

export async function extractLatestFilesFromBundle(
  blob: Blob,
  filename: string,
  contentType: string
): Promise<File[]> {
  if (!isZipBundle(contentType, filename)) {
    return [new File([blob], filename, { type: contentType || blob.type })];
  }

  const bundle = await loadShareBundleEntries(blob);
  if (!bundle) {
    return [new File([blob], filename, { type: contentType || blob.type })];
  }

  const { manifest, rootOrder, sortedEntries, files } = bundle;
  const latestByRoot = new Map<string, File>();
  for (let i = 0; i < sortedEntries.length; i += 1) {
    const entry = sortedEntries[i];
    latestByRoot.set(getShareBundleEntryRootId(manifest, entry), files[i]);
  }

  const latestFiles = rootOrder
    .map((rootId) => latestByRoot.get(rootId))
    .filter((file): file is File => Boolean(file));

  if (latestFiles.length > 0) {
    return latestFiles;
  }

  return [new File([blob], filename, { type: contentType || blob.type })];
}
