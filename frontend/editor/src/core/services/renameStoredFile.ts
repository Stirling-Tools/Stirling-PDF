import { fileStorage } from "@app/services/fileStorage";
import { moveLastViewedPage } from "@app/services/lastViewedPageStore";
import type { FileId } from "@app/types/file";
import type { StirlingFileStub } from "@app/types/fileContext";

/**
 * Renames a stored file, then its open workspace copy. Storage is written
 * first so a failed write leaves the open copy as it was. Resolves false when
 * storage has no record of the file.
 */
export async function renameStoredFile(
  stub: Pick<StirlingFileStub, "id" | "name" | "size" | "lastModified">,
  name: string,
  updateStub: (id: FileId, updates: Partial<StirlingFileStub>) => void,
): Promise<boolean> {
  // quickKey is name|size|lastModified; a stale one would make a re-upload of
  // the original look like a duplicate of the renamed file.
  const quickKey = `${name}|${stub.size}|${stub.lastModified}`;
  const saved = await fileStorage.updateFileMetadata(stub.id, {
    name,
    quickKey,
  });
  if (!saved) return false;
  // Rebuilt from the name rather than read from the stub: a version's stub
  // carries its parent's quickKey until it is reloaded from storage.
  moveLastViewedPage(`${stub.name}|${stub.size}|${stub.lastModified}`, {
    fileId: stub.id,
    quickKey,
  });
  updateStub(stub.id, { name, quickKey });
  return true;
}
