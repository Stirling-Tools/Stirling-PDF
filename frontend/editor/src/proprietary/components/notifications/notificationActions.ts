import { useContext, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { withBasePath } from "@app/constants/app";
import { FileActionsContext } from "@app/contexts/file/contexts";
import {
  PORTAL_BASENAME,
  PORTAL_FAILURES_ANCHOR,
} from "@app/routes/portalBasename";
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
  // Raw context, not `useFileActions` (shell problem, point 1): in the processor shell there is no
  // provider above the bell, and a hook that insists on one would take the whole panel down with it.
  const fileContext = useContext(FileActionsContext);

  // Pick up a document handed over by the other shell (shell problem, point 2). Selecting an id the file
  // store has not loaded yet is the point: the selection resolves once the restore reaches that file.
  useEffect(() => {
    if (!fileContext) return;
    const fileId = takeSelection();
    if (fileId) fileContext.actions.setSelectedFiles([fileId as FileId]);
  }, [fileContext]);

  return useMemo<ClientActionRegistry>(() => {
    const openDocument = (
      fileId: string | null,
      path: string,
    ): ClientActionOutcome | void => {
      if (fileId) {
        if (fileContext) {
          fileContext.actions.setSelectedFiles([fileId as FileId]);
        } else if (!stashSelection(fileId)) {
          // Nothing would be selected on arrival, so say so here rather than navigate to a page
          // that looks like it worked.
          return {
            ok: false,
            message: t(
              "notifications.handoffUnavailable",
              "This browser will not let the processor pass the document to the editor. Open it from the editor instead.",
            ),
          };
        }
      }
      goToEditor(path);
    };

    const viewFile: ClientActionSpec = {
      available: (context) => context.hasLocalFile,
      closesPanel: true,
      run: (context) => openDocument(context.notification.fileId, "/"),
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
  }, [fileContext, navigate, t]);
}
