/**
 * Classifies where a stored file lives. The UI uses this to badge each file
 * (Local vs Cloud) and to drive the origin filter chip.
 *
 * - "local" - only in the browser's IndexedDB
 * - "cloud" - also exists on the server (uploaded), still owned by the user
 * - "shared-with-me" - opened from a share link / not owned by current user
 */

import { StirlingFileStub } from "@app/types/fileContext";

export type FileOrigin = "local" | "cloud" | "shared-with-me";

export const FILE_ORIGINS: FileOrigin[] = ["local", "cloud", "shared-with-me"];

export function getFileOrigin(file: StirlingFileStub): FileOrigin {
  if (file.remoteSharedViaLink || file.remoteOwnedByCurrentUser === false) {
    return "shared-with-me";
  }
  if (file.remoteStorageId) {
    return "cloud";
  }
  return "local";
}
