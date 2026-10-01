import { mkdir, rename, remove, stat, writeFile } from "@tauri-apps/plugin-fs";
import {
  readDiskFile,
  writeDiskFile,
  type DiskFileEntry,
} from "@app/services/localFolderContents";
import { generateId } from "@app/utils/generateId";
import { beginSelfWrite, endSelfWrite } from "@app/services/diskFileSync";
import { directoryKey } from "@app/services/localFolderStorage";

/** A directory and one filename returned by the filesystem. */
export function processingPath(directory: string, name: string): string {
  if (!name || name === "." || name === ".." || /[/\\]/.test(name)) {
    throw new Error("Invalid processing filename");
  }
  return `${directory.replace(/[/\\]+$/, "")}/${name}`;
}

/** Fingerprints are refreshed after our own writes so the folder never processes its own output. */
export async function processingFileState(
  path: string,
): Promise<DiskFileEntry> {
  const info = await stat(path);
  return {
    path,
    name: path.split(/[/\\]/).pop()!,
    sizeBytes: info.size,
    lastModified: info.mtime?.getTime() ?? 0,
  };
}

export function sameProcessingFile(
  left: DiskFileEntry,
  right: DiskFileEntry,
): boolean {
  return (
    directoryKey(left.path) === directoryKey(right.path) &&
    left.sizeBytes === right.sizeBytes &&
    left.lastModified === right.lastModified
  );
}

/** Refuses to overwrite a file edited while its server pipeline was running. */
export async function requireUnchangedProcessingFile(
  entry: DiskFileEntry,
): Promise<void> {
  if (!sameProcessingFile(entry, await processingFileState(entry.path))) {
    throw new Error(`The file changed during processing: ${entry.name}`);
  }
}

/** Keeps a recoverable original before any processed output replaces it. */
export async function archiveProcessingInput(
  directory: string,
  file: File,
): Promise<string> {
  const archive = `${directory}/.stirling-originals`;
  await mkdir(archive, { recursive: true });
  const name = await writeDiskFile(
    archive,
    `${generateId()}-${file.name}`,
    file,
  );
  if (!name) throw new Error("The processing folder is no longer mounted");
  return processingPath(archive, name);
}

/** Stages bytes beside the input before replacing it; a failed write leaves the input intact. */
export async function replaceProcessingFile(
  entry: DiskFileEntry,
  file: File,
): Promise<DiskFileEntry> {
  const temporary = `${entry.path}.${generateId()}.tmp`;
  await requireUnchangedProcessingFile(entry);
  beginSelfWrite(entry.path);
  try {
    await writeFile(temporary, new Uint8Array(await file.arrayBuffer()), {
      createNew: true,
    });
    await requireUnchangedProcessingFile(entry);
    await rename(temporary, entry.path);
    return await processingFileState(entry.path);
  } finally {
    await remove(temporary).catch(() => {});
    endSelfWrite(entry.path);
  }
}

/** Reads an archived original through the same mounted-directory guard as other disk inputs. */
export async function readProcessingOriginal(path: string): Promise<File> {
  const file = await readDiskFile(await processingFileState(path));
  if (!file) throw new Error("The processing folder is no longer mounted");
  return file;
}
