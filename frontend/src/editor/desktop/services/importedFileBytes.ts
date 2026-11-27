import { pendingFilePathMappings } from "@editor/services/pendingFilePathMappings";
import { readFileFromDisk } from "@editor/services/desktopFileLink";
import { isDroppedFile } from "@editor/services/fileImportPaths";

const COPY_LIMIT_BYTES = 512 * 1024 * 1024;

async function copyBytes(file: File): Promise<ArrayBuffer | null> {
  const path = await pendingFilePathMappings.get(file);
  const fromDisk = path ? await readFileFromDisk(path) : null;
  if (fromDisk?.byteLength === file.size) return fromDisk;
  return file.arrayBuffer().catch(() => null);
}

export async function fileWithOwnBytes(file: File): Promise<File> {
  if (!isDroppedFile(file) || file.size > COPY_LIMIT_BYTES) return file;
  const bytes = await copyBytes(file);
  if (!bytes) return file;
  const copy = new File([bytes], file.name, {
    type: file.type,
    lastModified: file.lastModified,
  });
  const sourcePath = pendingFilePathMappings.get(file);
  if (sourcePath !== undefined) pendingFilePathMappings.set(copy, sourcePath);
  return copy;
}
