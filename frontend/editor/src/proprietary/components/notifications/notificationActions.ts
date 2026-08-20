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
import { useAiEngineEnabled } from "@app/hooks/useAiEngineEnabled";
import {
  PORTAL_BASENAME,
  PORTAL_FAILURES_ANCHOR,
} from "@app/routes/portalBasename";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";
import { fileStorage } from "@app/services/fileStorage";
import {
  retryWithPassword,
  unlockLocalDocument,
  type RetryOutputFile,
  type RetryPayload,
} from "@app/services/notificationRetry";
import {
  rerunPolicy,
  rechainPolicyOnDocument,
  type PolicyRerunOutcome,
  type PolicyRetryTarget,
} from "@app/services/notificationPolicyRetry";
import { reportNotificationResolved } from "@app/services/notifications";
import {
  createChildStub,
  generateProcessedFileMetadata,
} from "@app/contexts/file/fileActions";
import { isValidToolId } from "@app/types/toolId";
import {
  createStirlingFile,
  type FileContextActions,
  type StirlingFileStub,
} from "@app/types/fileContext";
import type { FileId, ToolOperation } from "@app/types/file";
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
 * What this build can do about a failure notification: unlock the document and take the result, run
 * the failing work again, open the tool that failed, or go to the incident in the processor.
 *
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

/** False when the browser refused it, so the caller can fall back to navigating in place. */
function openInNewTab(path: string): boolean {
  return window.open(withBasePath(path), "_blank", "noopener") !== null;
}

/**
 * Not the router's `navigate`: the editor reads its tool from the URL on mount and on a history pop,
 * and a router push is neither, so the address would change and the workbench would not.
 */
function goToEditor(path: string): void {
  window.history.pushState({}, "", withBasePath(path));
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/**
 * The tool whose run failed, when the stashed operation names one this build still has. The stashed
 * `params` stay in the stash: a tool's parameters live in component state inside `useBaseParameters`,
 * which has no seam for initial values, and this is the place that would hand them over once it does.
 */
function toolPathOf(payload: RetryPayload): string {
  return isValidToolId(payload.operation)
    ? getToolUrlPath(payload.operation)
    : "/";
}

/**
 * What a retry would re-run. A union because the two are genuinely different: a tool retry is an
 * endpoint plus parameters, which exist only in the client that submitted them, and a policy retry is a
 * stored policy plus a document, which the server named on the notification itself.
 */
type RetryTarget =
  | { readonly kind: "tool"; readonly payload: RetryPayload }
  /** The policy and the document, exactly as the re-run takes them. */
  | { readonly kind: "policy"; readonly policy: PolicyRetryTarget };

/**
 * Which of the two a notification describes, or null when nothing here can re-run it.
 *
 * The policy shape wins where it applies, being the more specific claim: the row says which policy
 * failed on which document, whereas a stash only says which operation this browser last saw fail on it.
 *
 * The attended check repeats `isResolvableHere` in `useNotifications` so this function holds on its own
 * arguments rather than by arrangement with the caller.
 */
function retryTargetOf(context: NotificationActionContext): RetryTarget | null {
  const { notification, hasLocalFile, retryPayload } = context;
  if (!hasLocalFile) return null;

  const attended = (notification.sourceId ?? null) === null;
  if (attended && notification.policyId && notification.fileId) {
    return {
      kind: "policy",
      policy: { policyId: notification.policyId, fileId: notification.fileId },
    };
  }

  return retryPayload ? { kind: "tool", payload: retryPayload } : null;
}

/** The documents a password-carrying call produced, as files the workbench can take. */
function asFiles(outputs: RetryOutputFile[]): File[] {
  return outputs.map(
    (output) =>
      new File([output.blob], output.filename, {
        type: output.blob.type || "application/pdf",
      }),
  );
}

/**
 * Take what the retry produced into the workbench, so the unlocked document is what the user is looking
 * at once the panel closes.
 *
 * Versions the encrypted original in place rather than adding a second file. consumeFiles, not
 * removeFiles: a delete would close the very incident this retry means to fold onto.
 *
 * `derivedFromTool` is load-bearing. A plain upload is what `usePolicyAutoRun` watches for, so without
 * it this would fire the whole upload chain by itself: billed automation nobody asked for.
 */
async function adopt(
  actions: FileContextActions,
  parentStub: StirlingFileStub | null,
  files: File[],
): Promise<FileId[]> {
  const unlocked = files[0];
  if (!unlocked) return [];

  if (!parentStub) {
    const added = await actions.addFiles([unlocked], {
      selectFiles: true,
      derivedFromTool: true,
    });
    return added.map((file) => file.fileId);
  }

  const metadata = await generateProcessedFileMetadata(unlocked);
  const operation: ToolOperation = {
    toolId: "removePassword",
    timestamp: Date.now(),
  };
  const childStub: StirlingFileStub = {
    ...createChildStub(
      parentStub,
      operation,
      unlocked,
      metadata?.thumbnailUrl,
      metadata,
    ),
    derivedFromTool: true,
  };
  const stirlingFile = createStirlingFile(unlocked, childStub.id);
  const outputIds = await actions.consumeFiles(
    [parentStub.id],
    [stirlingFile],
    [childStub],
  );
  actions.setSelectedFiles(outputIds);
  return outputIds;
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
  // Safe without a provider (the app-config context carries a default), and needed here because the
  // upload chain a retry rejoins excludes the Classification policy when the engine is off.
  const aiEnabled = useAiEngineEnabled();

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

    /**
     * Open the editor on a specific tool with the document selected, from either shell. Unlike
     * {@link openDocument} this always goes through the URL, because the editor reads its tool out
     * of the URL: selecting alone would leave the workbench on whatever view it was on.
     */
    const openToolWithDocument = (
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

    const unavailable = (): ClientActionOutcome => ({
      ok: false,
      message: t(
        "notifications.retryUnavailable",
        "This document can no longer be retried from this browser.",
      ),
    });

    /**
     * What a policy re-run amounted to, in the reader's terms. A rejection after the unlock reads
     * differently from one before it, so the reader is not left thinking their password was wrong.
     *
     * An untracked run is reported as a failure on purpose. It did go, but nothing here will collect
     * what it produces, and the processed document was the point of the retry: presenting that as
     * success would close the row on a result that is never arriving.
     */
    const rerunOutcome = (
      outcome: PolicyRerunOutcome,
      adopted: boolean,
    ): ClientActionOutcome => {
      if (outcome.ok && outcome.tracked) return { ok: true };
      if (outcome.ok) {
        return {
          ok: false,
          message: adopted
            ? t(
                "notifications.unlockedRerunUndelivered",
                "The document was unlocked and the policy re-run started, but its result cannot be delivered here, so this failure stays open.",
              )
            : t(
                "notifications.rerunUndelivered",
                "The policy re-run started, but its result cannot be delivered here, so this failure stays open.",
              ),
        };
      }
      if (outcome.reason === "missingFile") {
        return {
          ok: false,
          message: t(
            "notifications.notOnThisDevice",
            "This document is not on this device, so it cannot be opened or retried here.",
          ),
        };
      }
      if (adopted) {
        return {
          ok: false,
          message: t(
            "notifications.unlockedNotRerun",
            "The document was unlocked and opened here, but the policy could not be run on it again.",
          ),
        };
      }
      return {
        ok: false,
        message:
          outcome.message ??
          t(
            "notifications.rerunRejected",
            "The policy could not be run again just now. Try again in a moment.",
          ),
      };
    };

    /**
     * Whether this device can re-run what the row describes. A policy re-run also needs the editor's
     * providers above the bell, not to submit the run but because a run fired from the processor shell
     * has no mounted workspace to collect its output.
     */
    const canRetry = (context: NotificationActionContext): boolean => {
      const target = retryTargetOf(context);
      if (!target) return false;
      return target.kind === "tool" || fileContext !== undefined;
    };

    const retry: ClientActionSpec = {
      available: canRetry,
      closesPanel: true,
      run: async (context): Promise<ClientActionOutcome | void> => {
        const target = retryTargetOf(context);
        if (!target) return unavailable();

        // A tool opens with the document selected rather than re-running from here: it failed once, so
        // the user gets to see the settings first. A stored policy has none to show, so it simply goes.
        if (target.kind === "tool") {
          return openToolWithDocument(
            context.notification.fileId,
            toolPathOf(target.payload),
          );
        }
        if (!fileContext) return unavailable();
        return rerunOutcome(await rerunPolicy(target.policy), false);
      },
    };

    const decryptAndRetry: ClientActionSpec = {
      // Only where there is somewhere to put the result: in the processor shell an unlocked document
      // would have nowhere to go, so the row promotes its next offer instead.
      available: (context) => fileContext !== undefined && canRetry(context),
      needsPassword: true,
      // On success the adopted document is the destination, and it is behind the panel.
      closesPanel: true,
      run: async (context, password): Promise<ClientActionOutcome> => {
        const target = retryTargetOf(context);
        if (!target || !password || !fileContext) return unavailable();

        // The stash for a tool, because only it knows what failed and with which parameters; the unlock
        // endpoint for a policy, since a locked input is fixed the same way whatever was reading it.
        const outcome =
          target.kind === "tool"
            ? await retryWithPassword(target.payload, password)
            : await unlockLocalDocument(target.policy.fileId, password);
        // A wrong password lands here, carrying the server's own words, which the row shows.
        if (!outcome.ok) return outcome;

        // It unlocked, so the user must end up holding it. A failed adoption fails the whole action:
        // claiming success and dropping the result leaves them nothing for the password they typed.
        const unlocked = asFiles(outcome.files ?? []);
        // Only a policy names an original to version; a tool retry keeps adding its output.
        const originalId =
          target.kind === "policy" ? (target.policy.fileId as FileId) : null;
        // Storage too, or a file merely closed in the sidebar ends up decrypted twice over.
        const parentStub = originalId
          ? (fileStore?.getState().files.byId?.[originalId] ??
            (await fileStorage.getStirlingFileStub(originalId)) ??
            null)
          : null;
        let adopted: FileId[] = [];
        try {
          adopted = await adopt(fileContext.actions, parentStub, unlocked);
        } catch {
          return {
            ok: false,
            message: t(
              "notifications.adoptFailed",
              "The document was unlocked but could not be opened here. Try the tool directly.",
            ),
          };
        }

        // Back through the run that choked on the locked document, under the ORIGINAL reference, so a
        // second failure folds onto this same incident. The adopted id goes too, since that is the
        // document the output belongs to now. After the adoption, so a refused re-run still leaves the
        // user holding what their password bought them.
        if (target.kind === "policy") {
          const document = unlocked[0];
          const rerun: PolicyRerunOutcome = document
            ? await rechainPolicyOnDocument(
                target.policy,
                document,
                adopted[0] ?? null,
                aiEnabled,
              )
            : { ok: false, reason: "missingFile" };
          // Anything short of a tracked run stops here, untracked included. The unlocked document
          // being in the workbench is not the result the user asked for: they wanted what the policy
          // makes of it, and that output has nowhere to land. Closing the row on the input alone
          // would retire a failure that is still costing them a billed run and still producing
          // nothing. One mapper decides, so the message and the resolve cannot disagree.
          const result = rerunOutcome(rerun, true);
          if (!result.ok) return result;
        }

        // Nothing else tells the server the retry worked, so without this the bell keeps reporting a
        // failure the user has fixed. Reached only once the whole retry has landed: the document is in,
        // and the re-run is being polled by something that will deliver it. Its result is ignored,
        // since a refused resolve is not a failed unlock.
        await reportNotificationResolved(context.notification.id);
        return { ok: true };
      },
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
      run: () => {
        // Leaving would cost them a loaded workbench, and every file in it a re-upload.
        const holdsFiles = (fileStore?.getState().files.ids.length ?? 0) > 0;
        if (canOpenHere && holdsFiles && openInNewTab(FAILURES_DESTINATION)) {
          return;
        }
        navigate(FAILURES_DESTINATION);
      },
    };

    return {
      RETRY: retry,
      DECRYPT_AND_RETRY: decryptAndRetry,
      VIEW_FILE: viewFile,
      VIEW_IN_PROCESSOR: viewInProcessor,
    };
  }, [canOpenHere, openInWorkbench, fileContext, fileStore, navigate, t]);
}
