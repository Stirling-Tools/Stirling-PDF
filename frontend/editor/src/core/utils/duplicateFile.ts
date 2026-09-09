import type { StirlingFile, StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";
import { fileStorage } from "@app/services/fileStorage";
import { splitFileName } from "@app/utils/fileUtils";

/** The subset of `useFileHandler().addFiles` a duplicate needs. */
type AddFilesFn = (
  files: File[],
  options: {
    selectFiles?: boolean;
    skipWorkspaceDispatch?: boolean;
    autoUnzip?: boolean;
    skipUploadTracking?: boolean;
  },
) => Promise<StirlingFile[]>;

/** "report.pdf" → "report (copy).pdf", counting up until the name is free. */
export function copyNameFor(name: string, taken: Iterable<string>): string {
  const [base, extension] = splitFileName(name);
  const used = new Set(taken);
  let candidate = `${base} (copy)${extension}`;
  for (let n = 2; used.has(candidate); n++) {
    candidate = `${base} (copy ${n})${extension}`;
  }
  return candidate;
}

/**
 * Copies a stored file into the library under a free "(copy)" name.
 *
 * The copy stays out of the workbench - it's an archive of the current bytes,
 * not a file the user asked to work on. That skips the ingest side-effects that
 * hang off the workspace dispatch, so the derived metadata is inherited from
 * the source instead: the bytes are identical, so its classification labels and
 * thumbnail are too, and re-deriving them would only re-parse the same PDF. The
 * copy also lands in the source's folder rather than back at the root.
 *
 * @returns the new file's id, or null if the source has no readable bytes.
 */
export async function duplicateStoredFile(
  stub: StirlingFileStub,
  existingNames: Iterable<string>,
  addFiles: AddFilesFn,
): Promise<FileId | null> {
  const source = await fileStorage.getStirlingFile(stub.id);
  if (!source) return null;

  const [copy] = await addFiles(
    [
      new File([source], copyNameFor(stub.name, existingNames), {
        type: source.type,
      }),
    ],
    {
      selectFiles: false,
      skipWorkspaceDispatch: true,
      // Duplicating an archive must yield one copy, not its contents scattered
      // across the library.
      autoUnzip: false,
      // A local copy is not a new document entering the system.
      skipUploadTracking: true,
    },
  );
  if (!copy) return null;

  const inherited: Parameters<typeof fileStorage.updateFileMetadata>[1] = {};
  if (stub.classificationLabels) {
    inherited.classificationLabels = stub.classificationLabels;
  }
  // A copy belongs beside its original. Safe to set on a local-only file: the
  // server is authoritative for folderId only on files it actually holds.
  if (stub.folderId) {
    inherited.folderId = stub.folderId;
  }
  // Blob URLs die with the session, so only a persisted thumbnail is worth
  // carrying over; without one the row falls back to lazy regeneration.
  if (stub.thumbnailUrl && !stub.thumbnailUrl.startsWith("blob:")) {
    inherited.thumbnail = stub.thumbnailUrl;
    inherited.thumbnailStoredAt = Date.now();
  }
  if (Object.keys(inherited).length > 0) {
    await fileStorage.updateFileMetadata(copy.fileId, inherited);
  }
  return copy.fileId;
}
