// The editor/processor shell switch unmounts every editor provider, and a reload starts from nothing:
// this mirrors the workbench into sessionStorage and refills an empty one from that record on mount.
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FileStoreContext,
  type FileStateStore,
} from "@app/contexts/file/contexts";
import { useFileActions } from "@app/contexts/FileContext";
import {
  useNavigationActions,
  useNavigationState,
} from "@app/contexts/NavigationContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { useAuth } from "@app/auth/UseSession";
import { useLocation } from "react-router-dom";
import { isAuthRoute } from "@app/constants/routes";
import { fileStorage } from "@app/services/fileStorage";
import { alert } from "@app/components/toast";
import { WORKBENCH_SESSION_RESTORE } from "@app/constants/featureFlags";
import {
  beginRestoredView,
  clearWorkbenchSession,
  resumeWorkbenchSession,
  endRestoredView,
  isSeedableView,
  originalIdOf,
  readWorkbenchSession,
  writeWorkbenchSession,
} from "@app/services/workbenchSession";
import type { WorkbenchType } from "@app/types/workbench";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

const WRITE_DEBOUNCE_MS = 300;

// Current leaf per original id; a forked chain resolves to the highest version.
function leafByOriginalId(
  leaves: StirlingFileStub[],
): Map<string, StirlingFileStub> {
  const map = new Map<string, StirlingFileStub>();
  for (const leaf of leaves) {
    const key = originalIdOf(leaf);
    const current = map.get(key);
    if (!current || (leaf.versionNumber ?? 1) > (current.versionNumber ?? 1)) {
      map.set(key, leaf);
    }
  }
  return map;
}

/** How long to wait for the NEXT file to hydrate before giving up on holding the view. Restarted on
 *  each arrival, so a slow device with large documents keeps the view as long as it makes progress. */
const SETTLE_TIMEOUT_MS = 5000;

/** Released a beat late, so effects reacting to the same commit still see the restore in progress. */
const RELEASE_GRACE_MS = 250;

/**
 * Reopen the recorded view, then hold the restore guard until the files have hydrated.
 *
 * The view is written ONCE. Re-asserting it after hydration would also overwrite a view the user
 * picked in the meantime; holding the guard is what keeps HomePage's defaults off it instead.
 */
function reopenView(
  store: FileStateStore,
  reopen: (view: WorkbenchType) => void,
  {
    view,
    fileCount,
    token,
  }: { view: WorkbenchType; fileCount: number; token: number },
): void {
  reopen(view);
  const loaded = () =>
    store.selectors.getFiles(store.getState().files.ids).length;

  const release = () =>
    setTimeout(() => endRestoredView(token), RELEASE_GRACE_MS);
  if (loaded() >= fileCount) {
    release();
    return;
  }

  let timer: ReturnType<typeof setTimeout>;
  const stop = () => {
    clearTimeout(timer);
    unsubscribe();
    release();
  };
  const waitForNext = () => {
    clearTimeout(timer);
    timer = setTimeout(stop, SETTLE_TIMEOUT_MS);
  };

  let seen = loaded();
  const unsubscribe = store.subscribe(() => {
    const now = loaded();
    if (now >= fileCount) return stop();
    // Progress, not completion: give the remaining files a fresh window.
    if (now > seen) {
      seen = now;
      waitForNext();
    }
  });
  waitForNext();
}

export function WorkbenchSessionPersistence() {
  const store = useContext(FileStoreContext);
  const { actions } = useFileActions();
  const { workbench } = useNavigationState();
  const { actions: navigationActions } = useNavigationActions();
  const { activeFileId, setActiveFileId } = useViewer();
  const { user, loading: authLoading } = useAuth();
  // Login/signup mount the editor's providers too. Nothing there is the user's workbench, so this
  // records nothing and restores nothing - otherwise signing out rebuilds it on the login screen.
  const onAuthRoute = isAuthRoute(useLocation().pathname);
  const userId = user?.id != null ? String(user.id) : null;
  const { t } = useTranslation();
  // Captured before the writer below can overwrite it with the empty boot state.
  const [saved] = useState(readWorkbenchSession);
  const restoreStarted = useRef(false);
  // Until the restore has run, this mount's empty state is not the truth to record.
  const restoreSettled = useRef(false);

  const write = useCallback(() => {
    if (!store || !restoreSettled.current) return;
    const state = store.getState();
    const toOriginal = (id: FileId): string | null => {
      const stub = state.files.byId[id];
      return stub ? originalIdOf(stub) : null;
    };
    const isPresent = (id: string | null): id is string => id !== null;
    writeWorkbenchSession({
      fileIds: state.files.ids.map(toOriginal).filter(isPresent),
      selectedFileIds: state.ui.selectedFileIds
        .map(toOriginal)
        .filter(isPresent),
      workbench,
      userId,
      activeFileId: activeFileId
        ? (toOriginal(activeFileId as FileId) ?? undefined)
        : undefined,
    });
  }, [store, workbench, activeFileId, userId]);

  // Read by the file subscription, which must not resubscribe on every view change.
  const writeRef = useRef(write);
  writeRef.current = write;

  useEffect(() => {
    if (!store || onAuthRoute) return;
    // This mount is a new session: undo any suspension left by a sign-out in this page's lifetime.
    resumeWorkbenchSession();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = store.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(() => writeRef.current(), WRITE_DEBOUNCE_MS);
    });
    return () => {
      clearTimeout(timer);
      // Flush, so the state at the moment of the shell switch is what survives.
      writeRef.current();
      unsubscribe();
    };
  }, [store, onAuthRoute]);

  // Changing view touches no file state, so the subscription above never sees it.
  useEffect(() => write(), [write]);

  useEffect(() => {
    if (restoreStarted.current) return;
    if (onAuthRoute) return;
    // Who is signed in decides whether this record is theirs to reopen, so settle that first.
    if (authLoading) return;
    restoreStarted.current = true;

    // A tab can outlive a sign-out (the logout clears it, but a 401 bounce or an expiry does not),
    // and the next person to sign in here must not open the last person's documents.
    if (saved && (saved.userId ?? null) !== userId) {
      clearWorkbenchSession();
      restoreSettled.current = true;
      return;
    }

    const nothingToDo =
      !WORKBENCH_SESSION_RESTORE ||
      !store ||
      !saved ||
      saved.fileIds.length === 0 ||
      store.getState().files.ids.length > 0;
    if (nothingToDo) {
      restoreSettled.current = true;
      return;
    }

    void (async () => {
      // Held while the files land: they are added one at a time, and each landing re-runs the
      // default-view heuristic, which must not overwrite the recorded view mid-restore.
      let held: number | null = null;
      try {
        // Resolve each id to its CURRENT leaf: a policy or another tab may have versioned it since.
        const leaves = leafByOriginalId(
          await fileStorage.getLeafStirlingFileStubs(),
        );
        const stubs = saved.fileIds
          .map((id) => leaves.get(id))
          .filter((stub): stub is StirlingFileStub => stub !== undefined);

        if (stubs.length > 0) {
          const view = isSeedableView(saved.workbench) ? saved.workbench : null;
          if (view) held = beginRestoredView();
          // The same entry point My Files uses, so a restored file is governed by the same rules as
          // any other file entering the workbench - including whether a policy has already run on it.
          await actions.addStirlingFileStubs(stubs);
          const selected = saved.selectedFileIds
            .map((id) => leaves.get(id)?.id)
            .filter((id): id is FileId => id !== undefined);
          if (selected.length > 0) actions.setSelectedFiles(selected);
          // After the files land: the viewer drops an active id it cannot find.
          const active = saved.activeFileId
            ? leaves.get(saved.activeFileId)?.id
            : undefined;
          if (active) setActiveFileId(active as string);
          if (view && held !== null) {
            reopenView(store, navigationActions.restoreWorkbench, {
              view,
              fileCount: stubs.length,
              token: held,
            });
            held = null; // reopenView owns the release from here.
          }
        }

        const missing = saved.fileIds.length - stubs.length;
        if (missing > 0) {
          alert({
            alertType: "warning",
            title:
              stubs.length === 0
                ? t(
                    "workbench.sessionRestore.none",
                    "Your previous files are no longer stored on this device.",
                  )
                : t(
                    "workbench.sessionRestore.partial",
                    "Restored {{restored}} of {{total}} files. The rest are no longer stored on this device.",
                    { restored: stubs.length, total: saved.fileIds.length },
                  ),
          });
        }
      } finally {
        if (held !== null) endRestoredView(held);
        // Even a failed restore must release the writer, or the record freezes for the session.
        restoreSettled.current = true;
      }
    })();
  }, [
    saved,
    store,
    actions,
    navigationActions,
    setActiveFileId,
    t,
    authLoading,
    userId,
    onAuthRoute,
  ]);

  return null;
}
