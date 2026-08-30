import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { alert } from "@app/components/toast";
import type { FileId } from "@app/types/file";
import type { StirlingFileStub } from "@app/types/fileContext";
import {
  downloadSharedBytes,
  fetchLatestSharedVersion,
} from "@app/services/sharedFileSave";
import { fileStorage } from "@app/services/fileStorage";
import { useFileActions } from "@app/contexts/FileContext";

/** True when the server holds a newer revision than the local bytes derive from. */
export function hasNewerSharedVersion(file: StirlingFileStub): boolean {
  return (
    typeof file.remoteVersionLatest === "number" &&
    typeof file.remoteVersionBase === "number" &&
    file.remoteVersionLatest > file.remoteVersionBase
  );
}

/** True when this stub is a shared file the current user may write back to. */
export function canEditSharedFile(file: StirlingFileStub): boolean {
  const isSharedWithUser =
    file.remoteOwnedByCurrentUser === false ||
    Boolean(file.remoteSharedViaLink);
  const hasServerRef = Boolean(file.remoteStorageId || file.remoteShareToken);
  const role = (file.remoteAccessRole ?? "viewer").toLowerCase();
  // Server decides; role is the fallback for stubs cached before canEdit existed.
  const writable = file.remoteCanEdit ?? role === "editor";
  return (
    isSharedWithUser &&
    hasServerRef &&
    file.remoteOwnedByCurrentUser !== true &&
    role === "editor" &&
    writable
  );
}

// Pulls the latest server revision of a shared file in as a fresh local copy
// tagged with the same remote linkage.
export function useSharedFileActions() {
  const { t } = useTranslation();
  const { actions } = useFileActions();

  const fetchLatestCopy = useCallback(
    async (file: StirlingFileStub): Promise<boolean> => {
      try {
        // Version first: if a writer commits between the two calls the bytes are
        // newer than the base, which costs a spurious 409, never a lost update.
        const latestVersion = await fetchLatestSharedVersion(file);
        const blob = await downloadSharedBytes(file);
        const latest = new File([blob], file.name, {
          type: blob.type || file.type,
        });
        const added = await actions.addFilesWithOptions([latest], {
          selectFiles: true,
          autoUnzip: false,
          skipAutoUnzip: true,
          allowDuplicates: true,
        });
        for (const entry of added) {
          const updates = {
            remoteStorageId: file.remoteStorageId,
            remoteStorageUpdatedAt: Date.now(),
            remoteOwnerUsername: file.remoteOwnerUsername,
            remoteOwnedByCurrentUser: file.remoteOwnedByCurrentUser,
            remoteAccessRole: file.remoteAccessRole,
            remoteCanEdit: file.remoteCanEdit,
            remoteSharedViaLink: file.remoteSharedViaLink,
            remoteShareToken: file.remoteShareToken,
            remoteVersionBase: latestVersion ?? undefined,
            remoteVersionLatest: latestVersion ?? undefined,
          };
          actions.updateStirlingFileStub(entry.fileId as FileId, updates);
          await fileStorage.updateFileMetadata(entry.fileId as FileId, updates);
        }
        // The old copy no longer tracks the server head; keep it as a plain
        // local fork so two entries don't both claim the same remote file.
        const forkUpdates = {
          remoteVersionLatest: file.remoteVersionBase,
        };
        actions.updateStirlingFileStub(file.id, forkUpdates);
        await fileStorage.updateFileMetadata(file.id, forkUpdates);
        alert({
          alertType: "success",
          title: t("storageCollab.latestFetched", "Latest version added"),
          body: t(
            "storageCollab.latestFetchedBody",
            "The newest shared version was added next to your copy so you can merge your changes.",
          ),
          expandable: false,
          durationMs: 5000,
        });
        return true;
      } catch (error) {
        console.error("Failed to fetch latest shared version:", error);
        alert({
          alertType: "warning",
          title: t(
            "storageCollab.fetchLatestFailed",
            "Unable to fetch the latest shared version.",
          ),
          expandable: false,
          durationMs: 4000,
        });
        return false;
      }
    },
    [actions, t],
  );

  return { fetchLatestCopy };
}
