import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { alert } from "@editor/components/toast";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import { useFileActions, useFileSelector } from "@editor/contexts/FileContext";
import {
  canAutoSync,
  classifySyncFailure,
  setServerSyncStatus,
} from "@editor/services/serverAutoSync";
import {
  recordChainUpload,
  uploadHistoryChain,
} from "@editor/services/serverStorageUpload";
import type { FileId, RemoteSyncBase } from "@editor/types/file";
import type {
  FileContextState,
  StirlingFileStub,
} from "@editor/types/fileContext";

// Long enough that a burst of edits (annotations, page moves) goes up as one
// upload rather than one per change.
const PUSH_DELAY_MS = 2000;

type PushableLeaf = StirlingFileStub & {
  remoteStorageId: number;
  remoteSync: RemoteSyncBase;
};

/**
 * Uses the history root as upload identity, including files without an explicit ancestor.
 */
function documentOf(stub: StirlingFileStub): FileId {
  return (stub.originalFileId || stub.id) as FileId;
}

/**
 * Preserves workspace order while omitting IDs whose records have already been removed.
 */
function stubsOf(files: FileContextState["files"]): StirlingFileStub[] {
  return files.ids
    .map((id) => files.byId[id])
    .filter((stub): stub is StirlingFileStub => stub !== undefined);
}

/**
 * Pushes edits to the user's own server files once they stop changing, when
 * automatic sync is on. Each push names the revision it was based on, so a
 * server copy replaced from another device is reported as a conflict instead
 * of being overwritten. A refused or failed push is retried only after a new
 * edit, a new base revision, or the connection coming back.
 */
export function ServerAutoSync() {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const enabled =
    config?.storageEnabled === true && config.storageAutoSyncEnabled === true;
  const { actions } = useFileActions();
  const files = useFileSelector((state) => state.files);
  const filesRef = useRef(files);
  filesRef.current = files;

  const inFlight = useRef(new Set<number>());
  const refusedRevision = useRef(new Map<number, string>());
  const failedLeaf = useRef(new Map<number, FileId>());
  // Re-runs the scheduler when nothing in file state changed: a push ending
  // while a newer version waits, or the connection returning.
  const [wakeups, setWakeups] = useState(0);

  useEffect(() => {
    /**
     * Retry connectivity failures when online, without clearing revision-conflict refusals.
     */
    const onOnline = () => {
      failedLeaf.current.clear();
      setWakeups((n) => n + 1);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  /**
   * Serializes uploads per remote file and uses the leaf's base revision to reject stale writes.
   * Conflicts pause that revision; other failures pause the leaf until a retry trigger.
   */
  const push = useCallback(
    async (leaf: PushableLeaf) => {
      const remoteId = leaf.remoteStorageId;
      if (inFlight.current.has(remoteId)) return;
      inFlight.current.add(remoteId);
      setServerSyncStatus(remoteId, "syncing");
      try {
        const result = await uploadHistoryChain(documentOf(leaf), remoteId, {
          expectedRevision: leaf.remoteSync.revision,
          quiet: true,
        });
        const document = documentOf(leaf);
        const affected = new Map<FileId, StirlingFileStub>();
        for (const stub of [...result.chain, ...stubsOf(filesRef.current)]) {
          if (documentOf(stub) === document) affected.set(stub.id, stub);
        }
        await recordChainUpload(
          result,
          [...affected.values()],
          actions.updateStirlingFileStub,
        );
        setServerSyncStatus(remoteId, undefined);
      } catch (error) {
        const failure = classifySyncFailure(error);
        setServerSyncStatus(remoteId, failure);
        if (failure === "conflict") {
          refusedRevision.current.set(remoteId, leaf.remoteSync.revision);
          alert({
            alertType: "warning",
            title: t("serverSync.conflict.title", "Changed on another device"),
            body: t(
              "serverSync.conflict.body",
              'The server copy of "{{name}}" is newer than the version you edited, so your changes were not uploaded. They are still here. Use Update on Server to replace the server copy with them.',
              { name: leaf.name },
            ),
            expandable: false,
            durationMs: 10000,
          });
        } else {
          failedLeaf.current.set(remoteId, leaf.id);
        }
      } finally {
        inFlight.current.delete(remoteId);
        setWakeups((n) => n + 1);
      }
    },
    [actions.updateStirlingFileStub, t],
  );

  useEffect(() => {
    if (!enabled) return;
    const due = stubsOf(files).filter(
      (stub): stub is PushableLeaf =>
        canAutoSync(stub) &&
        !inFlight.current.has(stub.remoteStorageId as number) &&
        refusedRevision.current.get(stub.remoteStorageId as number) !==
          stub.remoteSync?.revision &&
        failedLeaf.current.get(stub.remoteStorageId as number) !== stub.id,
    );
    if (due.length === 0) return;
    const timer = window.setTimeout(() => {
      for (const leaf of due) void push(leaf);
    }, PUSH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, files, push, wakeups]);

  return null;
}
