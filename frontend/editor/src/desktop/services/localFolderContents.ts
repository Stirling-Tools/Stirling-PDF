/**
 * Desktop read-through for mounted local folders, over the Tauri filesystem
 * plugin. The listing is taken fresh from the directory on every call —
 * nothing is copied or ingested to produce it.
 */

import { isTauri } from "@tauri-apps/api/core";
import {
  mkdir,
  readDir,
  readFile,
  stat,
  writeFile,
} from "@tauri-apps/plugin-fs";
import {
  directoryKey,
  localFolderStorage,
} from "@core/services/localFolderStorage";
import type {
  DiskDirEntry,
  DiskFileEntry,
  DiskListing,
} from "@core/services/localFolderContents";
export type { DiskDirEntry, DiskFileEntry, DiskListing };

/**
 * Containment: file reads and writes here run under a filesystem-wide Tauri
 * capability, but this module's contract is mounted directories only —
 * refuse any path outside one. The capability layer is the real trust
 * boundary; this keeps the contract explicit and a bad path inert.
 *
 * The mount store is read fresh on every call: it holds a handful of rows,
 * which is nothing next to the file bytes about to cross the IPC bridge,
 * and the heavy callers (thumbnails) are already concurrency-throttled.
 * Fresh reads mean a removed mount is refused immediately.
 */
async function isWithinMount(path: string): Promise<boolean> {
  const pathKey = directoryKey(path);
  const folders = await localFolderStorage.getAllFolders();
  return folders
    .map((folder) => directoryKey(folder.directory ?? ""))
    .filter((key) => key.length > 0)
    .some(
      (dir) =>
        pathKey === dir ||
        pathKey.startsWith(dir.endsWith("/") ? dir : `${dir}/`),
    );
}

/**
 * A directory can hold anything; the page shouldn't drown in it. Everything
 * up to the cap lists; past it, the freshest files win — for a Downloads-like
 * directory that is also the end the user is looking for.
 */
const LIST_CAP = 500;

/**
 * Every stat is a webview↔Rust round trip, so a big directory's listing cost
 * is IPC latency, not disk speed. Overlapping the calls turns N sequential
 * hops into N/BATCH; the batch bound keeps a 10k-file directory from opening
 * 10k requests at once.
 */
const STAT_BATCH = 32;

/**
 * Lexical join. The async path.join is itself an IPC round trip, which a
 * per-file loop cannot afford; joining a listed directory to a child name it
 * itself reported needs no normalization the string can't do.
 */
function joinPath(directory: string, name: string): string {
  const sep = directory.includes("\\") ? "\\" : "/";
  const base = directory.endsWith(sep)
    ? directory.slice(0, -sep.length)
    : directory;
  return `${base}${sep}${name}`;
}

export const canListDirectory = isTauri();

export async function listDirectory(
  directory: string,
): Promise<DiskListing | null> {
  if (!canListDirectory) return null;
  const dirEntries = await readDir(directory);
  // Visible entries only: dotfiles are hidden on disk for a reason. One
  // level deep — a subdirectory is listed when the user enters it.
  const visible = dirEntries.filter((entry) => !entry.name.startsWith("."));
  const directories: DiskDirEntry[] = visible
    .filter((entry) => entry.isDirectory)
    .map((entry) => ({
      path: joinPath(directory, entry.name),
      name: entry.name,
    }))
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  const candidates = visible.filter((entry) => entry.isFile);
  const files: DiskFileEntry[] = [];
  for (let i = 0; i < candidates.length; i += STAT_BATCH) {
    const batch = candidates.slice(i, i + STAT_BATCH);
    const stats = await Promise.all(
      batch.map(async (entry) => {
        const path = joinPath(directory, entry.name);
        try {
          const info = await stat(path);
          return {
            path,
            name: entry.name,
            sizeBytes: info.size,
            lastModified: info.mtime ? new Date(info.mtime).getTime() : 0,
          };
        } catch {
          // Vanished or unreadable mid-listing; the next look tells the truth.
          return null;
        }
      }),
    );
    for (const entry of stats) {
      if (entry) files.push(entry);
    }
  }
  files.sort((a, b) => b.lastModified - a.lastModified);
  return { files: files.slice(0, LIST_CAP), directories };
}

/**
 * Create a subdirectory. Same containment and name rules as a file write;
 * the OS refuses an existing name, which is the answer the user wants.
 */
export async function makeDiskDirectory(
  parent: string,
  name: string,
): Promise<string | null> {
  if (!canListDirectory) return null;
  if (!(await isWithinMount(parent))) return null;
  const path = joinPath(parent, safeBaseName(name));
  await mkdir(path);
  return path;
}

/**
 * The filesystem gives back bytes and a name, never a MIME type — but
 * everything downstream branches on File.type (the thumbnail generator's PDF
 * path, the workbench's format handling), and an untyped File silently takes
 * every "unknown format" branch. Recover the type from the extension.
 */
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
};

function mimeForName(name: string): string {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return MIME_BY_EXTENSION[ext] ?? "";
}

export async function readDiskFile(entry: DiskFileEntry): Promise<File | null> {
  if (!canListDirectory) return null;
  if (!(await isWithinMount(entry.path))) return null;
  const bytes = await readFile(entry.path);
  return new File([new Uint8Array(bytes)], entry.name, {
    type: mimeForName(entry.name),
    lastModified: entry.lastModified || undefined,
  });
}

/** How many "(n)" suffixes to try before conceding the directory is hostile. */
const UNIQUE_NAME_ATTEMPTS = 1000;

/**
 * File names come from outside the app's control — zip entries, a server's
 * Content-Disposition — and this function holds a filesystem-wide write
 * scope. Reduce whatever arrives to a plain basename so a name like
 * "..\\evil" cannot steer the write out of the chosen directory.
 */
function safeBaseName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const trimmed = base.trim();
  if (trimmed === "" || trimmed === "." || trimmed === "..") return "file";
  return trimmed;
}

export async function writeDiskFile(
  directory: string,
  name: string,
  bytes: Blob,
): Promise<string | null> {
  if (!canListDirectory) return null;
  if (!(await isWithinMount(directory))) return null;
  name = safeBaseName(name);
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  const data = new Uint8Array(await bytes.arrayBuffer());
  // The directory is the user's: an existing name keeps its file and the
  // incomer takes " (n)", the same convention the OS itself uses. The
  // exclusive create is what makes that a guarantee rather than a hope: a
  // probe-then-write would let a file created in between be overwritten,
  // while create-new fails atomically and the loop simply moves on.
  for (let n = 0; n < UNIQUE_NAME_ATTEMPTS; n++) {
    const candidate = n === 0 ? name : `${base} (${n})${ext}`;
    const path = joinPath(directory, candidate);
    try {
      await writeFile(path, data, { createNew: true });
      return candidate;
    } catch (err) {
      if (!isAlreadyExists(err)) throw err;
    }
  }
  throw new Error(`No free name for ${name} in ${directory}`);
}

/**
 * The plugin surfaces OS errors as text. EEXIST is 17; Windows reports
 * ERROR_FILE_EXISTS (80) or ERROR_ALREADY_EXISTS (183) depending on the call.
 */
function isAlreadyExists(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err);
  return /already exists|file exists|os error (17|80|183)\b/i.test(text);
}
