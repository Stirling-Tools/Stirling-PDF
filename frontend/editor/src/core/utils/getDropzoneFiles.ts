import type { DropzoneProps } from "@mantine/dropzone";

type DropEvent = Parameters<NonNullable<DropzoneProps["getFilesFromEvent"]>>[0];

async function readEntryFiles(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    return [file];
  }

  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const files: File[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) return files;
    const nested = await Promise.all(batch.map(readEntryFiles));
    for (const children of nested) files.push(...children);
  }
}

/**
 * Captures dropped files before the event's data store closes, without reopening
 * them through permission-gated handles. Retains recursive directory drops.
 * Pair with useFsAccessApi=false: file dialogs must supply input events.
 */
export async function getDropzoneFiles(
  event: DropEvent,
): Promise<Array<File | DataTransferItem>> {
  if ("dataTransfer" in event && event.dataTransfer) {
    const transfer = event.dataTransfer;
    const items = Array.from(transfer.items ?? []).filter(
      (item) => item.kind === "file",
    );
    if (event.type !== "drop") return items;

    const files = items.length
      ? (
          await Promise.all(
            items.map((item) => {
              const entry = item.webkitGetAsEntry?.();
              if (entry?.isDirectory) return readEntryFiles(entry);
              const file = item.getAsFile();
              if (!file) throw new Error("Could not read a dropped file.");
              return [file];
            }),
          )
        ).flat()
      : Array.from(transfer.files);
    return files.filter(
      (file) => file.name !== ".DS_Store" && file.name !== "Thumbs.db",
    );
  }

  if ("target" in event && event.target && "files" in event.target) {
    return Array.from((event.target as HTMLInputElement).files ?? []);
  }
  return [];
}
