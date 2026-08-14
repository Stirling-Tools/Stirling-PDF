/**
 * Desktop read-through for mounted local folders, over the Tauri filesystem
 * plugin. The listing is taken fresh from the directory on every call —
 * nothing is copied or ingested to produce it.
 */

import { isTauri } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { readDir, readFile, stat } from "@tauri-apps/plugin-fs";
import type { DiskFileEntry } from "@core/services/localFolderContents";
export type { DiskFileEntry };

/**
 * A directory can hold anything; the page shouldn't drown in it. Everything
 * up to the cap lists; past it, the freshest files win — for a Downloads-like
 * directory that is also the end the user is looking for.
 */
const LIST_CAP = 500;

export const canListDirectory = isTauri();

export async function listDirectory(
  directory: string,
): Promise<DiskFileEntry[] | null> {
  if (!canListDirectory) return null;
  const dirEntries = await readDir(directory);
  const files: DiskFileEntry[] = [];
  for (const entry of dirEntries) {
    // Regular, visible files only: subdirectories are the filesystem's
    // business, and dotfiles are hidden there for a reason.
    if (!entry.isFile || entry.name.startsWith(".")) continue;
    const path = await join(directory, entry.name);
    try {
      const info = await stat(path);
      files.push({
        path,
        name: entry.name,
        sizeBytes: info.size,
        lastModified: info.mtime ? new Date(info.mtime).getTime() : 0,
      });
    } catch {
      // Vanished or unreadable mid-listing; the next look tells the truth.
    }
  }
  files.sort((a, b) => b.lastModified - a.lastModified);
  return files.slice(0, LIST_CAP);
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
  const bytes = await readFile(entry.path);
  return new File([new Uint8Array(bytes)], entry.name, {
    type: mimeForName(entry.name),
    lastModified: entry.lastModified || undefined,
  });
}
