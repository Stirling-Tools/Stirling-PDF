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
import { HAS_PORTAL } from "@app/routes/hasPortal";
import { fileStorage } from "@app/services/fileStorage";
import { rerunPolicy } from "@app/services/notificationPolicyRetry";
import { dispatchNotificationAction } from "@app/services/notifications";
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
  type ResolutionActionId,
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
      // Desktop ships the app without the processor, so the destination is not routed there and
      // the button navigated to nothing.
      available: () => HAS_PORTAL,
      closesPanel: true,
      run: () => navigate(REVIEW_DESTINATION),
    };

    const heldByServer = (context: NotificationActionContext) =>
      context.notification.documentLocation === "SMART_FOLDER";

    // What the server does on this browser's behalf: the document is in a folder this browser
    // cannot reach, so all the client does is ask, and the row names which file it is about.
    const askTheServer = (
      actionId: string,
      whenItFails: string,
    ): ClientActionSpec => ({
      available: heldByServer,
      run: async (context, password): Promise<ClientActionOutcome | void> => {
        const refusal = await dispatchNotificationAction(
          context.notification.id,
          actionId,
          password === undefined ? undefined : { password },
        );
        if (refusal === null) return;
        // The server's own words where it gave any: only it knows whether the password was
        // wrong, the document beyond repair, or the folder no longer writable.
        return { ok: false, message: refusal || whenItFails };
      },
    });

    /**
     * One fix, carried out wherever the document is: the server resolves the same action id to the
     * side that can reach it, so the row renders one button and this picks the half that can act.
     */
    const fix = (
      resolution: (typeof RESOLUTIONS)[number],
      whenTheServerFails: string,
    ): ClientActionSpec => {
      const here = resolutionSpec(resolution, { t, fileContext, fileStore });
      const there = askTheServer(resolution.actionId, whenTheServerFails);
      return {
        available: (context) =>
          heldByServer(context)
            ? there.available(context)
            : here.available(context),
        // Static, so it must hold for both halves; it does, because what a fix needs from the
        // person asking for it does not depend on which machine carries it out.
        needsPassword: resolution.needsPassword,
        // The server half opens nothing to get out of the way, but the row it was about is gone
        // either way, so the panel behind the prompt is stale in both.
        closesPanel: here.closesPanel,
        run: (context, password) =>
          heldByServer(context)
            ? there.run(context, password)
            : here.run(context, password),
      };
    };

    /** What to say when the server's half fails without a reason of its own. */
    const serverFixFailed: Record<ResolutionActionId, string> = {
      REPAIR: t(
        "notifications.repairInFolderFailed",
        "That document could not be repaired just now.",
      ),
      DECRYPT: t(
        "notifications.decryptInFolderFailed",
        "That document could not be unlocked just now.",
      ),
    };

    const fixes = Object.fromEntries(
      RESOLUTIONS.map((resolution) => [
        resolution.actionId,
        fix(resolution, serverFixFailed[resolution.actionId]),
      ]),
    );

    // One id, run by whichever side holds the document: the server resolves it per row, and this
    // picks the half that can act. Not a fix(): a retry asks nothing of the person pressing it.
    const rerunInFolder = askTheServer(
      "OPEN_IN_TOOL",
      t(
        "notifications.retryInFolderFailed",
        "That document could not be run again just now.",
      ),
    );
    const retry: ClientActionSpec = {
      available: (context) =>
        heldByServer(context)
          ? rerunInFolder.available(context)
          : openInTool.available(context),
      closesPanel: openInTool.closesPanel,
      run: (context) =>
        heldByServer(context)
          ? rerunInFolder.run(context)
          : openInTool.run(context),
    };

    return {
      OPEN_IN_TOOL: retry,
      ...fixes,
      VIEW_FILE: viewFile,
      VIEW_IN_PROCESSOR: viewInProcessor,
    };
  }, [canOpenHere, openInWorkbench, fileContext, fileStore, navigate, t]);
}
