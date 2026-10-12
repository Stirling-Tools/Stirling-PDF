import { StirlingFileStub } from "@app/types/fileContext";

/** How a file stands relative to the original it was opened from. Derived
 *  rather than stored so every surface gets the same answer instead of
 *  re-deriving it. Always "none" where nothing links files to an original. */
export type DiskLinkState =
  /** Never came from a disk original: a web upload, or a tool output. */
  | "none"
  /** Backed by a real file that is present and matches what we hold. */
  | "linked"
  /** Came from disk, but the original is gone. Saving needs a new location. */
  | "orphaned"
  | "unavailable"
  /** Disk moved on while we held unsaved edits; two real versions exist. */
  | "conflict";

export function diskLinkState(
  stub: Pick<
    StirlingFileStub,
    | "localFilePath"
    | "orphanedFilePath"
    | "diskConflictAt"
    | "diskUnavailableReason"
  >,
): DiskLinkState {
  if (stub.localFilePath) {
    if (stub.diskConflictAt) return "conflict";
    return stub.diskUnavailableReason ? "unavailable" : "linked";
  }
  return stub.orphanedFilePath ? "orphaned" : "none";
}
