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
 * What this build can do about a failure notification: open the document it is about, or go to the
 * recorded failures in the processor.
 *
 * THE SHELL PROBLEM. The portal mounts as a sibling of the route that renders `AppProviders` (see
 * `proprietary/App.tsx`), so in the processor shell there is no FileContext, ToolWorkflowContext or
 * NavigationContext above this hook. Three things below are shaped by that and marked where they
 * appear: file state is reached through the raw context so its absence is a value rather than a thrown
 * error; a document the processor cannot select is handed over through session storage; and editor
 * destinations are reached by pushing the URL and announcing it. All three go away when the portal
 * route moves inside `AppProviders`.
 */

/**
 * The document a notification's actions are about, waiting for an editor to pick it up. Written only
 * when there is no file context to select it directly (shell problem, point 2). Session-scoped and
 * one-shot: it is a click the user just made, not state worth keeping.
 */
const HANDOFF_KEY = "stirling.notifications.pendingSelection";

/** The recorded-failures section of the processor, which is as precise as this link gets. */
const FAILURES_DESTINATION = `${PORTAL_BASENAME}/documents#${PORTAL_FAILURES_ANCHOR}`;

/** False when this browser will not store it, which the caller must not paper over. */
function stashSelection(fileId: string): boolean {
  try {
    window.sessionStorage.setItem(HANDOFF_KEY, fileId);
    return true;
  } catch {
    // Private mode, or storage disabled. Navigating anyway would land the user in the editor with
    // nothing selected and no idea why, so the caller reports it instead.
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
 * Go to an editor path from either shell. Not the router's `navigate` (shell problem, point 3): the
 * editor reads its tool out of the URL on mount and on a history pop, and a router push is neither, so
 * the address would change and the workbench would not. Pushing plus announcing covers both readers,
 * the same way `settingsNavigation` opens a settings section.
 */
function goToEditor(path: string): void {
  window.history.pushState({}, "", withBasePath(path));
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useNotificationActions(): ClientActionRegistry {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Raw contexts, not the hooks that wrap them (shell problem, point 1): in the processor shell
  // there is no provider above the bell, and a hook that insists on one would take the whole panel
  // down with it. All four are present together or not at all, which is what `canOpenHere` means.
  const fileContext = useContext(FileActionsContext);
  const fileStore = useContext(FileStoreContext);
  const navigation = useContext(NavigationActionsContext);
  const viewer = useContext(ViewerContext);
  const canOpenHere = Boolean(fileContext && fileStore && navigation && viewer);

  /**
   * Open a document the way the file sidebar does, rather than merely selecting it: a selected id
   * that is not in the workbench shows nothing, and the workbench keeps whatever view it was on.
   * So the stub is added if the workbench does not already hold it, made the active file, and the
   * viewer brought to the front.
   *
   * False when this shell cannot do it, or when the document is no longer in storage: the caller
   * turns that into the row's message instead of a navigation that appears to do nothing.
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

  // Pick up a document handed over by the other shell (shell problem, point 2). One-shot: the
  // handoff is read and cleared, so a later render cannot reopen a file the user has moved on from.
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

      // Already in the shell that owns the workbench, so open it in place. Navigating as well
      // would send the user through the role-based router at "/", which reads as the app
      // reloading itself and lands them wherever their role says, not on their document.
      if (canOpenHere) {
        // No message of its own: the row falls back to "that did not work", which is the whole
        // truth here. The document was in storage a moment ago or the button would not be on
        // screen, so a failure now is a race rather than something the user can act on.
        return (await openInWorkbench(fileId)) ? undefined : { ok: false };
      }

      // The processor shell has no workbench to open into, so hand the document over and go to
      // the editor's own URL. EDITOR_BASENAME rather than "/" for the same reason as above.
      if (!stashSelection(fileId)) {
        // Nothing would be opened on arrival, so say so here rather than navigate to a page
        // that looks like it worked.
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
      // The server only offers this to someone it will let read the queue, so audience is already
      // settled. What is left is whether the destination exists: the failures section it lands on is
      // mounted in dev only until failures get their own review screen, so in a build this would
      // navigate nowhere. Both gates lift together, and the other one is in portal/views/Documents.
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
