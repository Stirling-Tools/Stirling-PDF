import { fileStorage } from "@app/services/fileStorage";
import type { FileId } from "@app/types/file";
import type { StirlingFileStub } from "@app/types/fileContext";

/**
 * Renames a stored file, then its open workspace copy. Storage is written
 * first so a failed write leaves the open copy as it was. Resolves false when
 * storage has no record of the file.
 */
export async function renameStoredFile(
  stub: Pick<StirlingFileStub, "id" | "size" | "lastModified">,
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
  if (saved) updateStub(stub.id, { name, quickKey });
  return saved;
}
