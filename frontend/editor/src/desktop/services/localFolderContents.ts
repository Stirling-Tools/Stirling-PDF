/** Desktop read-through for mounted local folders, over the Tauri filesystem plugin. */

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
 * Containment: these reads and writes run under a filesystem-wide Tauri capability, but
 * the contract here is mounted directories only, so any path outside one is refused.
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

/** Caps the listing; past the cap the freshest files win, which is what is wanted
 *  in a Downloads-like directory. */
const LIST_CAP = 500;

/**
 * Every stat is a webview-to-Rust round trip, so listing cost is IPC latency, not disk
 * speed.
 */
const STAT_BATCH = 32;

/** Lexical join: path.join is another IPC round trip, and a directory joined to a
 *  name it reported itself needs no normalisation a string cannot do. */
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
  // Visible entries, one level deep: a subdirectory lists when the user enters it.
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
 * The filesystem returns bytes and a name, never a MIME type, and everything downstream
 * branches on File.type - an untyped File silently takes every "unknown format" path.
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
 * Names arrive from outside the app - zip entries, Content-Disposition - and this holds
 * a filesystem-wide write scope.
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
  // An existing name keeps its file and the incomer takes " (n)", as the OS does.
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

/** The plugin surfaces OS errors as text: EEXIST is 17, Windows 80 or 183. */
function isAlreadyExists(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err);
  return /already exists|file exists|os error (17|80|183)\b/i.test(text);
}
