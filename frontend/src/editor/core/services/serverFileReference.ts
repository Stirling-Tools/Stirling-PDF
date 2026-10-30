import type { FileId } from "@editor/types/file";
import type { StirlingFileStub } from "@editor/types/fileContext";

export const STORED_FILE_ID_PREFIX = "storage:";

const SERVER_STUB_PREFIX = "server-";

/** Returns a storage reference only while the local copy still matches the server copy. */
export function storedFileIdForStub(
  stub: StirlingFileStub | undefined,
): string | undefined {
  if (!stub) return undefined;
  if (stub.isLeaf === false) return undefined;
  if (stub.remoteSharedViaLink || stub.remoteShareToken) return undefined;
  if (stub.processedFile?.isEncrypted === true) return undefined;

  if (typeof stub.remoteStorageId === "number") {
    if (stub.id.startsWith(SERVER_STUB_PREFIX)) {
      return `${STORED_FILE_ID_PREFIX}${stub.remoteStorageId}`;
    }
    // Version 1 with no parent or tool provenance identifies the original bytes; the local
    // timestamp is the download time, not the server update time.
    if (
      (stub.versionNumber ?? 1) <= 1 &&
      !stub.parentFileId &&
      !stub.derivedFromTool
    ) {
      return `${STORED_FILE_ID_PREFIX}${stub.remoteStorageId}`;
    }
    return undefined;
  }

  // Server-only stubs carry the storage id in the id itself before their bytes are cached.
  if (stub.id.startsWith(SERVER_STUB_PREFIX)) {
    const id = Number(stub.id.slice(SERVER_STUB_PREFIX.length));
    return Number.isFinite(id) ? `${STORED_FILE_ID_PREFIX}${id}` : undefined;
  }
  return undefined;
}

export function storedFileIdForFile(
  file: File,
  getStub: (id: FileId) => StirlingFileStub | undefined,
): string | undefined {
  const fileId = (file as { fileId?: FileId }).fileId;
  if (typeof fileId !== "string") return undefined;
  return storedFileIdForStub(getStub(fileId));
}
