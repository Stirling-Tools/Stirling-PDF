import {
  exists,
  mkdir,
  rename,
  remove,
  stat,
  writeFile,
} from "@tauri-apps/plugin-fs";
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

/** Refuses to overwrite a file edited while its server pipeline was running. */
export async function requireUnchangedProcessingFile(
  entry: DiskFileEntry,
): Promise<void> {
  if (!sameProcessingFile(entry, await processingFileState(entry.path))) {
    throw new Error(`The file changed during processing: ${entry.name}`);
  }
}

/** Stages a complete original; a new document can replace an existing same-name backup. */
export async function archiveProcessingInput(
  directory: string,
  file: File,
  replaceExisting = false,
): Promise<string> {
  const archive = processingPath(directory, ".stirling");
  const path = processingPath(archive, file.name);
  if (!(await isWithinMount(archive))) {
    throw new Error("The processing folder is no longer mounted");
  }
  await mkdir(archive, { recursive: true });
  return navigator.locks.request(
    `processing-original:${directoryKey(path)}`,
    async () => {
      let previous: DiskFileEntry | undefined;
      if (await exists(path)) {
        if (!(await stat(path)).isFile)
          throw new Error("The original is not a file");
        if (!replaceExisting) return path;
        previous = await processingFileState(path);
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
        if (previous) await requireUnchangedProcessingFile(previous);
        else if (await exists(path))
          throw new Error("An original was created while archiving this file");
        await rename(temporary, path);
        return path;
      } finally {
        await remove(temporary).catch(() => {});
      }
    },
  );
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
