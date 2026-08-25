import { writeDiskFile } from "@app/services/localFolderContents";

export interface MountWriteItem {
  name: string;
  /** Pulled lazily, one file at a time — a batch never sits in memory whole. */
  bytes: () => Promise<Blob | null>;
}

/**
 * Write a batch of named blobs into a mounted directory — the one engine
 * behind "upload while standing in a mount" and "move library files into a
 * mount", so failure accounting and collision behavior can't drift between
 * them. Failures are counted, never thrown: the caller owes the user one
 * banner for the batch, not an abort at the first bad file. `written[i]`
 * tells the caller which items verifiably landed (and are safe to retire
 * from app storage).
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
