/**
 * Polls local input directories for Watched Folders with inputSource === 'local-folder'.
 * On each cycle it scans the chosen directory, skips already-seen files,
 * registers new ones in watchedFolderFileStorage, and kicks off the automation pipeline.
 *
 * Polling only happens while the page is visible; the interval is reset on visibility restore.
 */

import { useEffect, useRef } from "react";
import { WatchedFolder } from "@app/types/watchedFolders";
import { watchedFolderStorage } from "@app/services/watchedFolderStorage";
import { watchedFolderFileStorage } from "@app/services/watchedFolderFileStorage";
import { folderDirectoryHandleStorage } from "@app/services/folderDirectoryHandleStorage";
import {
  folderSeenFilesStorage,
  makeSeenKey,
} from "@app/services/folderSeenFilesStorage";
import { resolveInputFile } from "@app/hooks/useFolderAutomation";
import { canReadLocalFolder } from "@app/utils/fsAccessCapability";

const POLL_INTERVAL_MS = 10_000;

export function useLocalFolderPoller(
  runPipeline: (
    folder: WatchedFolder,
    file: File,
    inputFileId: string,
    ownedByFolder: boolean,
  ) => Promise<void>,
): void {
  const runPipelineRef = useRef(runPipeline);
  useEffect(() => {
    runPipelineRef.current = runPipeline;
  });

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (
        cancelled ||
        document.visibilityState !== "visible" ||
        !canReadLocalFolder
      )
        return;

      let folders: WatchedFolder[];
      try {
        folders = await watchedFolderStorage.getAllFolders();
      } catch {
        return;
      }

      const localFolders = folders.filter(
        (f) => f.inputSource === "local-folder" && !f.isPaused,
      );
      if (localFolders.length === 0) return;

      for (const folder of localFolders) {
        if (cancelled) return;
        try {
          const inputHandle = await folderDirectoryHandleStorage.getInput(
            folder.id,
          );
          if (!inputHandle) continue;

          const hasPermission =
            await folderDirectoryHandleStorage.ensureReadPermission(
              inputHandle,
            );
          if (!hasPermission) continue;

          const folderData = await watchedFolderFileStorage.getFolderData(
            folder.id,
          );
          // Build set of file names already in the folder (any status) to avoid duplicates
          // keyed by name+size (can't use lastModified — file handle gives same value each time)
          const processingNames = new Set(
            Object.values(folderData?.files ?? {})
              .filter(
                (m) => m.status === "processing" || m.status === "pending",
              )
              .map((m) => m.name)
              .filter(Boolean) as string[],
          );

          for await (const [, entry] of (
            inputHandle as unknown as {
              entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
            }
          ).entries()) {
            if (cancelled) return;
            if (entry.kind !== "file") continue;

            let file: File;
            try {
              file = await (entry as FileSystemFileHandle).getFile();
            } catch {
              continue;
            }

            if (!file.name.toLowerCase().endsWith(".pdf")) continue;

            if (processingNames.has(file.name)) continue;

            const seenKey = makeSeenKey(folder.id, file);
            const alreadySeen = await folderSeenFilesStorage.isSeen(seenKey);
            if (alreadySeen) continue;

            await folderSeenFilesStorage.markSeen(seenKey);

            const { inputFileId, ownedByFolder } = await resolveInputFile(file);

            await watchedFolderFileStorage.addFileToFolder(
              folder.id,
              inputFileId,
              {
                status: "pending",
                name: file.name,
                ownedByFolder,
              },
            );

            void runPipelineRef.current(
              folder,
              file,
              inputFileId,
              ownedByFolder,
            );
          }
        } catch (err) {
          console.warn(
            `[local-folder-poller] Error scanning folder ${folder.id}:`,
            err,
          );
        }
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);

    function handleVisibility() {
      if (document.visibilityState === "visible") poll();
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []); // deliberately empty — uses refs for mutable callbacks
}
