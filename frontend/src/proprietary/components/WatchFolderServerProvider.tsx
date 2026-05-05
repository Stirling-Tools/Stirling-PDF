/**
 * Proprietary wrapper that overrides the core IDB-only WatchFolderStorageProvider
 * with the server-backed implementation when premium is enabled.
 *
 * On first premium load, migrates existing IDB folders, file metadata, and run
 * history to the server. The flag is only set when ALL upserts succeed; partial
 * failures cause a retry on the next load.
 */

import React, { useEffect, useRef } from "react";
import { AxiosError } from "axios";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { WatchFolderStorageProvider } from "@app/contexts/WatchFolderStorageContext";
import { serverBackend } from "@proprietary/services/watchFolderServerBackend";
import { smartFolderStorage } from "@app/services/smartFolderStorage";
import { folderStorage } from "@app/services/folderStorage";
import { folderRunStateStorage } from "@app/services/folderRunStateStorage";
import { watchFolderApi } from "@proprietary/services/watchFolderApiService";

const MIGRATION_KEY = "watch_folders_migrated_to_server";
const MIGRATION_LOCK = "watch-folders-migration";

/** True if the error indicates the folder already exists on the server. */
function isFolderAlreadyExistsError(err: unknown): boolean {
  if (!(err instanceof AxiosError) || !err.response) return false;
  // Spring maps DataIntegrityViolationException → 409 Conflict (or 500 in some configs);
  // a duplicate-id race during create resolves either way — treat both as "already exists".
  return err.response.status === 409 || err.response.status === 500;
}

/**
 * Migrate a single folder (definition + file metadata + runs) from IDB to the server.
 *
 * Coarse-grained idempotency: if the folder is already on the server (`serverIds.has(id)`),
 * skip ALL three steps — file/run rows are presumed to have been migrated by a prior run.
 * Re-migrating run rows would duplicate them (`addRuns` is not idempotent server-side).
 *
 * The Web Lock around `runMigration` ensures only one tab migrates at a time, so we won't
 * race with ourselves over a folder that's mid-migration in another tab.
 */
async function migrateOne(folderId: string, serverIds: Set<string>): Promise<void> {
  const folder = await smartFolderStorage.getFolder(folderId);
  if (!folder) return;

  // Folder already on server — assume its files/runs were migrated previously and skip.
  if (serverIds.has(folder.id)) return;

  // 1. Folder definition. Tolerate duplicate-id races (another tab snuck in).
  try {
    await serverBackend.createFolderWithId(folder);
  } catch (err) {
    if (!isFolderAlreadyExistsError(err)) throw err;
  }

  // 2. File metadata. updateFileMetadata is idempotent server-side (PUT keyed by folderId+fileId)
  // and pushes the full snapshot, so we don't need a separate addFileToFolder roundtrip.
  const record = await folderStorage.getFolderData(folder.id);
  if (record) {
    for (const [fileId, meta] of Object.entries(record.files)) {
      await serverBackend.updateFileMetadata(folder.id, fileId, meta);
    }
  }

  // 3. Run history.
  const runs = await folderRunStateStorage.getFolderRunState(folder.id);
  if (runs.length > 0) {
    await serverBackend.addFolderRunEntries(folder.id, runs);
  }
}

async function runMigration(): Promise<boolean> {
  if (localStorage.getItem(MIGRATION_KEY)) return true;

  const idbFolders = await smartFolderStorage.getAllFolders();
  if (idbFolders.length === 0) {
    localStorage.setItem(MIGRATION_KEY, "1");
    return true;
  }

  const serverFolders = await watchFolderApi.list();
  const serverIds = new Set(serverFolders.map((f) => f.id));

  let allOk = true;
  for (const folder of idbFolders) {
    try {
      await migrateOne(folder.id, serverIds);
    } catch (err) {
      console.warn(`[watch-folders] Migration of folder ${folder.id} failed:`, err);
      allOk = false;
    }
  }

  // Only commit the flag when every folder migrated cleanly; otherwise retry next load.
  if (allOk) localStorage.setItem(MIGRATION_KEY, "1");
  return allOk;
}

export function WatchFolderServerProvider({ children }: { children: React.ReactNode }) {
  const { config } = useAppConfig();
  const isPremium = config?.premiumEnabled === true;
  const migrationRan = useRef(false);

  useEffect(() => {
    if (!isPremium || migrationRan.current) return;
    if (localStorage.getItem(MIGRATION_KEY)) return;
    migrationRan.current = true;

    // Use Web Locks API when available so concurrent tabs don't double-migrate;
    // fall back to a plain run when the API is missing (older browsers / SSR).
    const run = async () => {
      try {
        await runMigration();
      } catch (err) {
        console.warn("[watch-folders] Migration aborted:", err);
      }
    };

    if ("locks" in navigator) {
      navigator.locks.request(MIGRATION_LOCK, { ifAvailable: true }, async (lock) => {
        // ifAvailable: lock is null if another tab has it — skip; that tab will commit the flag.
        if (!lock) return;
        if (localStorage.getItem(MIGRATION_KEY)) return; // re-check after lock acquired
        await run();
      });
    } else {
      void run();
    }
  }, [isPremium]);

  if (!isPremium) {
    return <>{children}</>;
  }

  return <WatchFolderStorageProvider backend={serverBackend}>{children}</WatchFolderStorageProvider>;
}
