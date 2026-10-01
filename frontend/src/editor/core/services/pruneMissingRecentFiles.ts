import { StirlingFileStub, FileId } from "@app/types/fileContext";

// Seam for reconciling the file list against wherever its records came from.
// Where IndexedDB is the only truth a stored record cannot have gone missing,
// so the list is already the answer.

/** A file that lost its original while the user had it open. */
export interface DetachedOpenFile {
  id: FileId;
  name: string;
  /** The now-dead path, so the caller can record it as the orphaned path. */
  path: string;
}

export interface PruneOptions {
  /** Files open in the workbench. Deleting one would leave an on-screen
   *  document existing nowhere, so open files are detached rather than
   *  deleted whatever their edit state. */
  openFileIds?: ReadonlySet<FileId>;
  /** Open files whose original vanished. The caller MUST apply the same detach
   *  to its own stubs: save paths read the workbench stub and would otherwise
   *  keep writing to the dead path. */
  onOpenFilesDetached?: (files: DetachedOpenFile[]) => void;
}

export async function pruneMissingRecentFiles(
  stubs: StirlingFileStub[],
  _options: PruneOptions = {},
): Promise<StirlingFileStub[]> {
  return stubs;
}
