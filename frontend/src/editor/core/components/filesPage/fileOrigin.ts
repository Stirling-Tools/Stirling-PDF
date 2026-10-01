import { StirlingFileStub } from "@app/types/fileContext";
import type { FolderId, FolderRecord } from "@app/types/folder";

export type FileOrigin = "local" | "cloud" | "shared-with-me";

/** Browser-only files have neither a server copy nor a link to a file on disk. */
export function isBrowserOnlyFile(file: StirlingFileStub): boolean {
  return getFileOrigin(file) === "local" && !file.localFilePath;
}

/** Local includes browser and disk copies without server storage; shared access takes precedence. */
export function getFileOrigin(file: StirlingFileStub): FileOrigin {
  if (file.remoteSharedViaLink || file.remoteOwnedByCurrentUser === false) {
    return "shared-with-me";
  }
  if (file.remoteStorageId) {
    return "cloud";
  }
  return "local";
}

/** Local files without a known folder are hidden from Stirling library but remain in Recents. */
export function isUnfiledLocalFile(
  file: StirlingFileStub,
  foldersById: ReadonlyMap<FolderId, FolderRecord>,
): boolean {
  return (
    getFileOrigin(file) === "local" &&
    (!file.folderId || !foldersById.has(file.folderId))
  );
}
