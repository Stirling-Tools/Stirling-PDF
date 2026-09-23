import {
  exists,
  lstat,
  readDir,
  remove,
  type FileInfo,
} from "@tauri-apps/plugin-fs";
import { directoryKey } from "@app/services/localFolderStorage";
import { isWithinMount } from "@app/services/localFolderContents";
import { processingPath } from "@app/services/localProcessingDelivery";
import {
  localProcessingFolderStorage as storage,
  type LocalProcessingFile,
  type LocalProcessingFolder,
} from "@app/services/localProcessingFolderStorage";
import { requireAutomationSession } from "@app/services/serverAutomationSession";

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

function backupVersion(info: FileInfo): string {
  return `${info.size}:${info.mtime?.getTime() ?? 0}:${info.birthtime?.getTime() ?? 0}`;
}

async function anyPresent(paths: string[]): Promise<boolean> {
  for (const path of paths) if (await exists(path)) return true;
  return false;
}

async function clearExpiry(
  entry: LocalProcessingFile,
): Promise<LocalProcessingFile> {
  if (!entry.orphanedOriginal) return entry;
  const updated = { ...entry, orphanedOriginal: undefined };
  await storage.saveFile(updated);
  return updated;
}

async function reconcileOriginal(
  folder: LocalProcessingFolder,
  entry: LocalProcessingFile,
  present: Set<string>,
  now: number,
): Promise<LocalProcessingFile | null> {
  if (!entry.originalPath || !TERMINAL.has(entry.run.status))
    return clearExpiry(entry);
  const paths = [
    ...new Set(
      [entry.input, ...entry.outputs].map((file) =>
        processingPath(folder.directory, file.name),
      ),
    ),
  ];
  if (
    paths.some((path) => present.has(directoryKey(path))) ||
    (await anyPresent(paths))
  ) {
    return clearExpiry(entry);
  }
  const name = entry.originalPath.split(/[/\\]/).pop()!;
  const archive = [".stirling", ".stirling-originals"]
    .map((directory) => processingPath(folder.directory, directory))
    .find(
      (directory) =>
        directoryKey(processingPath(directory, name)) ===
        directoryKey(entry.originalPath!),
    );
  if (!archive) return entry;
  const archiveInfo = await lstat(archive);
  if (!archiveInfo.isDirectory || archiveInfo.isSymlink) return entry;
  if (!(await exists(entry.originalPath))) {
    await storage.deleteFile(entry.id);
    return null;
  }
  const info = await lstat(entry.originalPath);
  if (!info.isFile || info.isSymlink) return entry;
  const version = backupVersion(info);
  const orphaned = entry.orphanedOriginal;
  if (
    !orphaned ||
    orphaned.version !== version ||
    !Number.isFinite(orphaned.since) ||
    orphaned.since < 0 ||
    orphaned.since > now
  ) {
    const updated = { ...entry, orphanedOriginal: { since: now, version } };
    await storage.saveFile(updated);
    return updated;
  }
  if (now - orphaned.since < RETENTION_MS) return entry;
  await requireAutomationSession(folder.sessionKey);
  if (!(await isWithinMount(folder.directory))) return entry;
  if (await anyPresent(paths)) return clearExpiry(entry);
  const current = await lstat(entry.originalPath);
  if (
    !current.isFile ||
    current.isSymlink ||
    backupVersion(current) !== version
  )
    return entry;
  await remove(entry.originalPath);
  await storage.deleteFile(entry.id);
  return null;
}

/**
 * Reclaims backups after seven days without an input or output. The caller holds the folder's
 * processing lock and validates its session/mount. Raw directory entries keep unreadable files
 * present: the UI listing omits files whose stat fails and cannot establish deletion.
 */
export async function reconcileLocalProcessingOriginals(
  folder: LocalProcessingFolder,
  history: LocalProcessingFile[],
  now = Date.now(),
): Promise<LocalProcessingFile[]> {
  const entries = await readDir(folder.directory);
  const present = new Set(
    entries.map((entry) =>
      directoryKey(processingPath(folder.directory, entry.name)),
    ),
  );
  const retained: LocalProcessingFile[] = [];
  for (const entry of history) {
    try {
      const updated = await reconcileOriginal(folder, entry, present, now);
      if (updated) retained.push(updated);
    } catch {
      // Unreadable backups and failed deletions are retried on the next successful scan.
      retained.push(entry);
    }
  }
  return retained;
}
