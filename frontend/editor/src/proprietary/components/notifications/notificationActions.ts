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
import { getToolUrlPath } from "@app/data/toolsTaxonomy";
import {
  PORTAL_BASENAME,
  PORTAL_REVIEW_PATH,
} from "@app/routes/portalBasename";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";
import { fileStorage } from "@app/services/fileStorage";
import { rerunPolicy } from "@app/services/notificationPolicyRetry";
import { isValidToolId, type ToolId } from "@app/types/toolId";
import type { FileId } from "@app/types/file";
import {
  RESOLUTIONS,
  canRetry,
  rerunOutcome,
  resolutionSpec,
  retryTargetOf,
  toolOf,
  unavailable,
} from "@app/components/notifications/resolutions";
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

// The portal mounts as a sibling of AppProviders, so no workbench contexts sit above this hook.

const HANDOFF_KEY = "stirling.notifications.pendingSelection";

const REVIEW_DESTINATION = `${PORTAL_BASENAME}${PORTAL_REVIEW_PATH}`;

/** The document to open on arrival, and the tool to open it into. */
interface Handoff {
  fileId: string;
  tool: ToolId | null;
}

/** False when storage refused it: navigating anyway lands the user in an empty editor. */
function stashSelection(fileId: string, tool: ToolId | null = null): boolean {
  try {
    window.sessionStorage.setItem(
      HANDOFF_KEY,
      JSON.stringify({ fileId, tool }),
    );
    return true;
  } catch {
    return false;
  }
}

function takeSelection(): Handoff | null {
  try {
    const stored = window.sessionStorage.getItem(HANDOFF_KEY);
    if (stored === null) return null;
    window.sessionStorage.removeItem(HANDOFF_KEY);
    const { fileId, tool } = JSON.parse(stored) as Record<string, unknown>;
    if (typeof fileId !== "string" || fileId === "") return null;
    return {
      fileId,
      tool: typeof tool === "string" && isValidToolId(tool) ? tool : null,
    };
  } catch {
    return null;
  }
}

/** Not the router's `navigate`: the editor reads its tool on mount and on a history pop. */
function goToEditor(path: string): void {
  window.history.pushState({}, "", withBasePath(path));
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useNotificationActions(): ClientActionRegistry {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Raw, because the wrapping hooks throw without a provider. All four are present or none are.
  const fileContext = useContext(FileActionsContext);
  const fileStore = useContext(FileStoreContext);
  const navigation = useContext(NavigationActionsContext);
  const viewer = useContext(ViewerContext);
  const canOpenHere = Boolean(fileContext && fileStore && navigation && viewer);

  /** Opens the way the file sidebar does: an id the workbench does not hold renders nothing. */
  const openInWorkbench = useCallback(
    async (fileId: string, tool: ToolId | null = null): Promise<boolean> => {
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
      // The viewer is what scopes a tool to one document; every other view hands it all of them.
      if (tool) {
        navigation.actions.setToolAndWorkbench(tool, "viewer");
      } else {
        navigation.actions.setWorkbench("viewer");
      }
      return true;
    },
    [fileContext, fileStore, navigation, viewer],
  );

  // One-shot: a later render must not reopen a file the user has moved on from.
  useEffect(() => {
    if (!canOpenHere) return;
    const handoff = takeSelection();
    if (handoff) void openInWorkbench(handoff.fileId, handoff.tool);
  }, [canOpenHere, openInWorkbench]);

  return useMemo<ClientActionRegistry>(() => {
    const openDocument = async (
      fileId: string | null,
    ): Promise<ClientActionOutcome | void> => {
      if (!fileId) return;

      // In place: "/" is the landing router, which redirects wherever the account belongs.
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

    /** Into the viewer, the only view that scopes the tool to the one document that failed. */
    const openToolWithDocument = async (
      fileId: string | null,
      tool: ToolId | null,
    ): Promise<ClientActionOutcome | void> => {
      if (canOpenHere && fileId) {
        return (await openInWorkbench(fileId, tool))
          ? undefined
          : unavailable(t);
      }
      if (fileId && !stashSelection(fileId, tool)) {
        // Nothing would be open on arrival, so say so rather than navigate regardless.
        return {
          ok: false,
          message: t(
            "notifications.handoffUnavailable",
            "This browser will not let the processor pass the document to the editor. Open it from the editor instead.",
          ),
        };
      }
      goToEditor(tool ? getToolUrlPath(tool) : EDITOR_BASENAME);
    };

    const openInTool: ClientActionSpec = {
      available: (context) => canRetry(context, fileContext),
      closesPanel: true,
      run: async (context): Promise<ClientActionOutcome | void> => {
        const target = retryTargetOf(context);
        if (!target) return unavailable(t);

        // A tool opens rather than re-runs: it failed once, so the user sees the settings first.
        if (target.kind === "tool") {
          return openToolWithDocument(
            context.notification.fileId,
            toolOf(target.payload),
          );
        }
        if (!fileContext) return unavailable(t);
        return rerunOutcome(t, await rerunPolicy(target.policy), null);
      },
    };

    const viewFile: ClientActionSpec = {
      available: (context) => context.hasLocalFile,
      closesPanel: true,
      run: (context) => openDocument(context.notification.fileId),
    };

    const viewInProcessor: ClientActionSpec = {
      available: () => true,
      closesPanel: true,
      run: () => navigate(REVIEW_DESTINATION),
    };

    const resolutions = Object.fromEntries(
      RESOLUTIONS.map((resolution) => [
        resolution.actionId,
        resolutionSpec(resolution, { t, fileContext, fileStore }),
      ]),
    );

    return {
      OPEN_IN_TOOL: openInTool,
      ...resolutions,
      VIEW_FILE: viewFile,
      VIEW_IN_PROCESSOR: viewInProcessor,
    };
  }, [canOpenHere, openInWorkbench, fileContext, fileStore, navigate, t]);
}
