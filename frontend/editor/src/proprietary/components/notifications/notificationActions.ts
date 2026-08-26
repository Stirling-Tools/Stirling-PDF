import { useCallback, useContext, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { withBasePath } from "@app/constants/app";
import {
  FileActionsContext,
  FileStoreContext,
} from "@app/contexts/file/contexts";
import { NavigationActionsContext } from "@app/contexts/NavigationContext";
import { ViewerContext } from "@app/contexts/ViewerContext";
import {
  PORTAL_BASENAME,
  PORTAL_FAILURES_ANCHOR,
} from "@app/routes/portalBasename";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";
import { fileStorage } from "@app/services/fileStorage";
import type { FileId } from "@app/types/file";
import {
  type ClientActionOutcome,
  type ClientActionRegistry,
  type ClientActionSpec,
  type NotificationActionContext,
} from "@core/components/notifications/notificationActions";

export {
  type ClientActionOutcome,
  type ClientActionRegistry,
  type ClientActionSpec,
  type NotificationActionContext,
};

/**
 * The portal mounts as a sibling of `AppProviders`, so in the processor shell none of the workbench
 * contexts exist above this hook. That is why contexts are read raw and a document is handed over.
 */

const HANDOFF_KEY = "stirling.notifications.pendingSelection";

const FAILURES_DESTINATION = `${PORTAL_BASENAME}/documents#${PORTAL_FAILURES_ANCHOR}`;

/** False when storage refused it: navigating anyway lands the user in an editor with nothing open. */
function stashSelection(fileId: string): boolean {
  try {
    window.sessionStorage.setItem(HANDOFF_KEY, fileId);
    return true;
  } catch {
    return false;
  }
}

function takeSelection(): string | null {
  try {
    const fileId = window.sessionStorage.getItem(HANDOFF_KEY);
    if (fileId !== null) window.sessionStorage.removeItem(HANDOFF_KEY);
    return fileId;
  } catch {
    return null;
  }
}

/**
 * Not the router's `navigate`: the editor reads its tool from the URL on mount and on a history pop,
 * and a router push is neither, so the address would change and the workbench would not.
 */
function goToEditor(path: string): void {
  window.history.pushState({}, "", withBasePath(path));
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useNotificationActions(): ClientActionRegistry {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Raw, because the hooks that wrap these throw when there is no provider, and in the processor
  // shell there is none. All four are present together or not at all.
  const fileContext = useContext(FileActionsContext);
  const fileStore = useContext(FileStoreContext);
  const navigation = useContext(NavigationActionsContext);
  const viewer = useContext(ViewerContext);
  const canOpenHere = Boolean(fileContext && fileStore && navigation && viewer);

  /**
   * Opens the way the file sidebar does. Selecting alone shows nothing: an id the workbench does not
   * hold has nothing to render, and the workbench keeps whatever view it was on.
   */
  const openInWorkbench = useCallback(
    async (fileId: string): Promise<boolean> => {
      if (!fileContext || !fileStore || !navigation || !viewer) return false;

      const stub = await fileStorage.getStirlingFileStub(fileId as FileId);
      if (!stub) return false;

      const alreadyOpen = fileStore
        .getState()
        .files.ids.some((id) => (id as string) === fileId);
      if (!alreadyOpen) {
        await fileContext.actions.addStirlingFileStubs([stub]);
      }
      viewer.setActiveFileId(fileId);
      navigation.actions.setWorkbench("viewer");
      return true;
    },
    [fileContext, fileStore, navigation, viewer],
  );

  // One-shot: read and cleared, so a later render cannot reopen a file the user has moved on from.
  useEffect(() => {
    if (!canOpenHere) return;
    const fileId = takeSelection();
    if (fileId) void openInWorkbench(fileId);
  }, [canOpenHere, openInWorkbench]);

  return useMemo<ClientActionRegistry>(() => {
    const openDocument = async (
      fileId: string | null,
    ): Promise<ClientActionOutcome | void> => {
      if (!fileId) return;

      // In place, with no navigation: "/" is the role-based router, so going there reads as the app
      // reloading and lands the user wherever their role says rather than on their document.
      if (canOpenHere) {
        return (await openInWorkbench(fileId)) ? undefined : { ok: false };
      }

      if (!stashSelection(fileId)) {
        return {
          ok: false,
          message: t(
            "notifications.handoffUnavailable",
            "This browser will not let the processor pass the document to the editor. Open it from the editor instead.",
          ),
        };
      }
      goToEditor(EDITOR_BASENAME);
    };

    const viewFile: ClientActionSpec = {
      available: (context) => context.hasLocalFile,
      closesPanel: true,
      run: (context) => openDocument(context.notification.fileId),
    };

    const viewInProcessor: ClientActionSpec = {
      // Its destination is dev-only until failures get a review screen; the other half of this gate
      // is in portal/views/Documents, and both lift together.
      available: () => import.meta.env.DEV,
      closesPanel: true,
      run: () => navigate(FAILURES_DESTINATION),
    };

    return {
      VIEW_FILE: viewFile,
      VIEW_IN_PROCESSOR: viewInProcessor,
    };
  }, [canOpenHere, openInWorkbench, navigate, t]);
}
