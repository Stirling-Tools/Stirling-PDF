import { fileStorage } from "@editor/services/fileStorage";
import {
  getShareBundleEntryRootId,
  type LoadedShareBundle,
} from "@editor/services/shareBundleUtils";
import type { FileId } from "@editor/types/file";
import type { StirlingFile, StirlingFileStub } from "@editor/types/fileContext";

interface ShareBundleImportHelpers {
  addFiles: (files: File[]) => Promise<StirlingFile[]>;
  updateStub: (id: FileId, updates: Partial<StirlingFileStub>) => void;
  isCancelled?: () => boolean;
}

export interface ImportedShareBundleFile {
  file: StirlingFile;
  updates: Partial<StirlingFileStub>;
}

/** Ingests every bundle version and returns the current file for each root. */
export async function importShareBundle(
  bundle: LoadedShareBundle,
  helpers: ShareBundleImportHelpers,
  additionalUpdates: Partial<StirlingFileStub> = {},
): Promise<ImportedShareBundleFile[]> {
  const ingested = await helpers.addFiles(bundle.files);
  if (helpers.isCancelled?.()) return [];

  const ingestedByLogicalId = new Map(
    bundle.sortedEntries.flatMap((entry, index) => {
      const file = ingested[index];
      return file ? [[entry.logicalId, file] as const] : [];
    }),
  );
  const rootFileIds = new Map(
    bundle.rootOrder.flatMap((rootLogicalId) => {
      const file = ingestedByLogicalId.get(rootLogicalId);
      return file ? [[rootLogicalId, file.fileId] as const] : [];
    }),
  );
  const updatesByLogicalId = new Map<string, Partial<StirlingFileStub>>();
  const currentEntryByRoot = new Map<
    string,
    LoadedShareBundle["sortedEntries"][number]
  >();

  for (const entry of bundle.sortedEntries) {
    const file = ingestedByLogicalId.get(entry.logicalId);
    if (!file) continue;
    const rootLogicalId = getShareBundleEntryRootId(bundle.manifest, entry);
    const updates: Partial<StirlingFileStub> = {
      ...additionalUpdates,
      versionNumber: entry.versionNumber,
      originalFileId:
        rootFileIds.get(rootLogicalId) ??
        ingestedByLogicalId.get(bundle.manifest.rootLogicalId)?.fileId ??
        file.fileId,
      parentFileId: entry.parentLogicalId
        ? ingestedByLogicalId.get(entry.parentLogicalId)?.fileId
        : undefined,
      toolHistory: entry.toolHistory,
      isLeaf: entry.isLeaf,
    };
    updatesByLogicalId.set(entry.logicalId, updates);
    currentEntryByRoot.set(rootLogicalId, entry);
    helpers.updateStub(file.fileId, updates);
    await fileStorage.updateFileMetadata(file.fileId, updates);
  }

  return bundle.rootOrder.flatMap((rootLogicalId) => {
    const currentEntry = currentEntryByRoot.get(rootLogicalId);
    if (!currentEntry) return [];
    const file = ingestedByLogicalId.get(currentEntry.logicalId);
    const updates = updatesByLogicalId.get(currentEntry.logicalId);
    return file && updates ? [{ file, updates }] : [];
  });
}
