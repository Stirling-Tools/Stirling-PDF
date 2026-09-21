import type { DropzoneProps } from "@mantine/dropzone";

type DropEvent = Parameters<NonNullable<DropzoneProps["getFilesFromEvent"]>>[0];

async function readEntryFiles(
  entry: FileSystemEntry,
  errors: string[],
): Promise<File[]> {
  const files: File[] = [];
  try {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      );
      return [file];
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    while (true) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      if (batch.length === 0) break;
      const nested = await Promise.all(
        batch.map((child) => readEntryFiles(child, errors)),
      );
      for (const children of nested) files.push(...children);
    }
  } catch (cause) {
    errors.push(`${entry.fullPath || entry.name}: ${dropErrorMessage(cause)}`);
  }
  return files;
}

function dropErrorMessage(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "Could not read a dropped file.";
}

/**
 * Captures dropped files before the event's data store closes, without reopening
 * them through permission-gated handles. Retains recursive directory drops.
 * Pair with useFsAccessApi=false: file dialogs must supply input events.
 * With onError, reports unreadable entries once and returns the readable files; otherwise rejects.
 */
export async function getDropzoneFiles(
  event: DropEvent,
  onError?: (error: Error) => void,
): Promise<Array<File | DataTransferItem>> {
  if ("dataTransfer" in event && event.dataTransfer) {
    const transfer = event.dataTransfer;
    const items = Array.from(transfer.items ?? []).filter(
      (item) => item.kind === "file",
    );
    if (event.type !== "drop") return items;

    const errors: string[] = [];
    const files = items.length
      ? (
          await Promise.all(
            items.map(async (item) => {
              try {
                const entry = item.webkitGetAsEntry?.();
                if (entry?.isDirectory) return readEntryFiles(entry, errors);
                const file = item.getAsFile();
                if (!file) throw new Error("Could not read a dropped file.");
                return [file];
              } catch (cause) {
                errors.push(dropErrorMessage(cause));
                return [];
              }
            }),
          )
        ).flat()
      : Array.from(transfer.files);
    if (errors.length) {
      const error = new Error(errors.join("\n"));
      if (!onError) throw error;
      onError(error);
    }
    return files.filter(
      (file) => file.name !== ".DS_Store" && file.name !== "Thumbs.db",
    );
  }

  if ("target" in event && event.target && "files" in event.target) {
    return Array.from((event.target as HTMLInputElement).files ?? []);
  }
  return [];
}
