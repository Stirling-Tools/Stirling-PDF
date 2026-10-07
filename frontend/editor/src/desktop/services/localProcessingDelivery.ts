import {
  lstat,
  mkdir,
  rename,
  remove,
  stat,
  writeFile,
} from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { getDiskFileState } from "@app/services/desktopFileLink";
import {
  readDiskFile,
  isWithinMount,
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

/** Refuses edits made during processing; returns false only when absence is explicitly allowed. */
export async function requireUnchangedProcessingFile(
  entry: DiskFileEntry,
  allowMissing = false,
): Promise<boolean> {
  const current = allowMissing
    ? await existingProcessingFile(entry.path)
    : await processingFileState(entry.path);
  if (current && !sameProcessingFile(entry, current)) {
    throw new Error(`The file changed during processing: ${entry.name}`);
  }
  return current !== null;
}

async function existingProcessingFile(
  path: string,
): Promise<DiskFileEntry | null> {
  const state = await getDiskFileState(path);
  if (state.availability === "gone") return null;
  if (state.availability === "unavailable") {
    throw new Error(`Cannot access processing file (${state.reason}): ${path}`);
  }
  return {
    path,
    name: path.split(/[/\\]/).pop()!,
    sizeBytes: state.size,
    lastModified: state.modifiedMs,
  };
}

/** Missing outputs are already cleaned up; inaccessible or edited outputs must survive restore. */
export async function removeProcessingOutput(
  entry: DiskFileEntry,
): Promise<void> {
  if (!(await requireUnchangedProcessingFile(entry, true))) return;
  try {
    await remove(entry.path);
  } catch (error) {
    if ((await getDiskFileState(entry.path)).availability !== "gone")
      throw error;
  }
}

/** Publishes the first complete original and preserves it through subsequent edits and runs. */
export async function archiveProcessingInput(
  directory: string,
  file: File,
): Promise<string> {
  const archive = processingPath(directory, ".stirling");
  const path = processingPath(archive, file.name);
  if (!(await isWithinMount(archive))) {
    throw new Error("The processing folder is no longer mounted");
  }
  await mkdir(archive, { recursive: true });
  const archiveInfo = await lstat(archive);
  if (!archiveInfo.isDirectory || archiveInfo.isSymlink)
    throw new Error("The original archive is not a directory");
  return navigator.locks.request(
    `processing-original:${directoryKey(path)}`,
    async () => {
      if (await existingProcessingFile(path)) {
        const info = await lstat(path);
        if (!info.isFile || info.isSymlink)
          throw new Error("The original is not a file");
        return path;
      }
      // Only a completed write is published as an original; crash leftovers stay hidden.
      const temporary = processingPath(
        archive,
        `.original-${generateId()}.tmp`,
      );
      try {
        await writeFile(temporary, new Uint8Array(await file.arrayBuffer()), {
          createNew: true,
        });
        await invoke("publish_processing_file", { temporary, path });
        return path;
      } finally {
        await remove(temporary).catch(() => {});
      }
    },
  );
}

/** Restores a deleted input without overwriting a file that reappears during staging. */
export async function restoreProcessingFile(
  path: string,
  file: File,
): Promise<DiskFileEntry> {
  const current = await existingProcessingFile(path);
  if (current) return replaceProcessingFile(current, file);
  const temporary = `${path}.${generateId()}.tmp`;
  beginSelfWrite(path);
  try {
    await writeFile(temporary, new Uint8Array(await file.arrayBuffer()), {
      createNew: true,
    });
    await invoke("publish_processing_file", { temporary, path });
    return await processingFileState(path);
  } finally {
    await remove(temporary).catch(() => {});
    endSelfWrite(path);
  }
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
  const parent = path.replace(/[/\\][^/\\]+$/, "");
  const directory = await lstat(parent);
  const original = await lstat(path);
  if (
    !directory.isDirectory ||
    directory.isSymlink ||
    !original.isFile ||
    original.isSymlink
  )
    throw new Error("The original is not a regular archived file");
  const file = await readDiskFile(await processingFileState(path));
  if (!file) throw new Error("The processing folder is no longer mounted");
  return file;
}
