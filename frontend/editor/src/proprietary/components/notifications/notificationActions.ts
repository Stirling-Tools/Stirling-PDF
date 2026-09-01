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
  PORTAL_FAILURES_ANCHOR,
} from "@app/routes/portalBasename";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";
import { fileStorage } from "@app/services/fileStorage";
import {
  retryWithPassword,
  stashMatchesKind,
  unlockLocalDocument,
  type PasswordRetryOutcome,
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
import { isValidToolId, type ToolId } from "@app/types/toolId";
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

// The portal mounts as a sibling of AppProviders, so no workbench contexts sit above this hook.

const HANDOFF_KEY = "stirling.notifications.pendingSelection";

const FAILURES_DESTINATION = `${PORTAL_BASENAME}/documents#${PORTAL_FAILURES_ANCHOR}`;

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

/** The stashed `params` stay stashed: `useBaseParameters` has no seam for initial values. */
function toolOf(payload: RetryPayload): ToolId | null {
  return isValidToolId(payload.operation) ? payload.operation : null;
}

/** A tool retry is an endpoint plus client-held parameters; a policy retry is a stored pair. */
type RetryTarget =
  | { readonly kind: "tool"; readonly payload: RetryPayload }
  | { readonly kind: "policy"; readonly policy: PolicyRetryTarget };

/** Which of the two a notification describes, or null when nothing here can re-run it. */
function retryTargetOf(context: NotificationActionContext): RetryTarget | null {
  const { notification, hasLocalFile, retryPayload } = context;
  if (!hasLocalFile) return null;

  // The policy shape wins where it applies, being the more specific claim.
  const attended = (notification.sourceId ?? null) === null;
  if (attended && notification.policyId && notification.fileId) {
    return {
      kind: "policy",
      policy: { policyId: notification.policyId, fileId: notification.fileId },
    };
  }

  // One stash per file, but one incident per kind per file, so the stash may be another row's.
  return retryPayload && stashMatchesKind(notification.kindId, retryPayload)
    ? { kind: "tool", payload: retryPayload }
    : null;
}

function asFiles(outputs: RetryOutputFile[]): File[] {
  return outputs.map(
    (output) =>
      new File([output.blob], output.filename, {
        type: output.blob.type || "application/pdf",
      }),
  );
}

/** Versions the original in place; `derivedFromTool` keeps `usePolicyAutoRun` off the result. */
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
  // Raw, because the wrapping hooks throw without a provider. All four are present or none are.
  const fileContext = useContext(FileActionsContext);
  const fileStore = useContext(FileStoreContext);
  const navigation = useContext(NavigationActionsContext);
  const viewer = useContext(ViewerContext);
  const canOpenHere = Boolean(fileContext && fileStore && navigation && viewer);
  // The upload chain a retry rejoins excludes Classification when the engine is off.

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

      // In place: "/" is the role-based router, which lands the user wherever their role says.
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
          : unavailable();
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

    const unavailable = (): ClientActionOutcome => ({
      ok: false,
      message: t(
        "notifications.retryUnavailable",
        "This document can no longer be retried from this browser.",
      ),
    });

    /** The service reports why and this layer words it, because the wording belongs where `t` is. */
    const unlockFailure = (
      outcome: PasswordRetryOutcome,
    ): ClientActionOutcome => {
      if (outcome.reason === "fileMissing") {
        return {
          ok: false,
          message: t(
            "notifications.notOnThisDevice",
            "This document is not on this device, so it cannot be opened or retried here.",
          ),
        };
      }
      if (outcome.reason === "notRetryable") return unavailable();
      // The server's own words, or nothing: the row falls back to its generic failure line.
      return { ok: false, message: outcome.message ?? undefined };
    };

    /** An untracked run is a failure on purpose: nothing here will collect what it produces. */
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

    /** A policy re-run also needs the editor's providers, to collect its output. */
    const canRetry = (context: NotificationActionContext): boolean => {
      const target = retryTargetOf(context);
      if (!target) return false;
      return target.kind === "tool" || fileContext !== undefined;
    };

    const openInTool: ClientActionSpec = {
      available: canRetry,
      closesPanel: true,
      run: async (context): Promise<ClientActionOutcome | void> => {
        const target = retryTargetOf(context);
        if (!target) return unavailable();

        // A tool opens rather than re-runs: it failed once, so the user sees the settings first.
        if (target.kind === "tool") {
          return openToolWithDocument(
            context.notification.fileId,
            toolOf(target.payload),
          );
        }
        if (!fileContext) return unavailable();
        return rerunOutcome(await rerunPolicy(target.policy), false);
      },
    };

    const decrypt: ClientActionSpec = {
      // In the processor shell an unlocked document has nowhere to go, so the row promotes on.
      available: (context) => fileContext !== undefined && canRetry(context),
      needsPassword: true,
      // On success the adopted document is the destination, and it is behind the panel.
      closesPanel: true,
      run: async (context, password): Promise<ClientActionOutcome> => {
        const target = retryTargetOf(context);
        if (!target || !password || !fileContext) return unavailable();

        // The stash knows a tool's parameters; a locked policy input just needs unlocking.
        const outcome =
          target.kind === "tool"
            ? await retryWithPassword(
                target.payload,
                password,
                context.notification.fileId,
              )
            : await unlockLocalDocument(target.policy.fileId, password);
        if (!outcome.ok) return unlockFailure(outcome);

        // A failed adoption fails the action: dropping the result leaves them nothing.
        const unlocked = asFiles(outcome.files ?? []);
        // Only a policy names an original to version; a tool retry keeps adding its output.
        const originalId =
          target.kind === "policy" ? (target.policy.fileId as FileId) : null;
        // Storage too, or a file merely closed in the sidebar gets decrypted twice over.
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

        // Under the ORIGINAL reference so a repeat folds on, and after the adoption.
        if (target.kind === "policy") {
          const document = unlocked[0];
          const rerun: PolicyRerunOutcome = document
            ? await rechainPolicyOnDocument(
                target.policy,
                document,
                adopted[0] ?? null,
              )
            : { ok: false, reason: "missingFile" };
          // Anything short of a tracked run stops here: the input alone is not the result.
          const result = rerunOutcome(rerun, true);
          if (!result.ok) return result;
        }

        // Ignored on purpose: a refused resolve is not a failed unlock.
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
      // Dev-only until failures get a review screen; portal/views/Documents holds the other half.
      available: () => import.meta.env.DEV,
      closesPanel: true,
      run: () => navigate(FAILURES_DESTINATION),
    };

    return {
      OPEN_IN_TOOL: openInTool,
      DECRYPT: decrypt,
      VIEW_FILE: viewFile,
      VIEW_IN_PROCESSOR: viewInProcessor,
    };
  }, [canOpenHere, openInWorkbench, fileContext, fileStore, navigate, t]);
}
