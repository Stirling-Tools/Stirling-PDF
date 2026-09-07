import { writeDiskFile } from "@app/services/localFolderContents";

export interface MountWriteItem {
  name: string;
  /** Pulled lazily, one file at a time — a batch never sits in memory whole. */
  bytes: () => Promise<Blob | null>;
}

/**
 * Write named blobs into a mounted directory - the one engine behind both uploading
 * into a mount and moving library files into one, so failure accounting and collision
 * behaviour cannot drift apart.
 */
export async function writeIntoMount(
  directory: string | undefined,
  items: MountWriteItem[],
): Promise<{ written: boolean[]; failedCount: number }> {
  const written: boolean[] = items.map(() => false);
  let failedCount = 0;
  for (let i = 0; i < items.length; i++) {
    try {
      const blob = directory ? await items[i].bytes() : null;
      const result =
        blob && directory
          ? await writeDiskFile(directory, items[i].name, blob)
          : null;
      if (result === null) {
        failedCount += 1;
      } else {
        written[i] = true;
      }
    } catch (err) {
      console.warn("[mountWrites] write into mount failed", err);
      failedCount += 1;
    }
  }
  return { written, failedCount };
}
