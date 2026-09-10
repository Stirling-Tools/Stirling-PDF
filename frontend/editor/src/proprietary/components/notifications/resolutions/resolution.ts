import type { ContextType } from "react";
import type { useTranslation } from "react-i18next";
import type {
  FileActionsContext,
  FileStoreContext,
} from "@app/contexts/file/contexts";
import { fileStorage } from "@app/services/fileStorage";
import {
  clearRetryPayload,
  stashMatchesKind,
  type RetryFailure,
  type RetryOutcome,
  type RetryOutputFile,
  type RetryPayload,
} from "@app/services/notificationRetry";
import {
  canPlacePolicy,
  rechainPolicyOnDocument,
  type PolicyRerunOutcome,
  type PolicyRetryTarget,
} from "@app/services/notificationPolicyRetry";
import { reportNotificationResolved } from "@app/services/notifications";
import type { FileId } from "@app/types/file";
import type { StirlingFileStub } from "@app/types/fileContext";
import { isValidToolId, type ToolId } from "@app/types/toolId";
import type {
  ClientActionOutcome,
  ClientActionSpec,
  NotificationActionContext,
} from "@app/components/notifications/notificationActions";
import {
  addToWorkbench,
  versionUnder,
} from "@app/components/notifications/resolutions/adopt";

// A resolution is decrypt's shape with the fix swapped out: produce a fixed document, take it
// into the workbench, re-run what failed, then tell the server. The differences between fixes
// are data, so the skeleton is written once and each fix supplies only what it does differently.

export type Translate = ReturnType<typeof useTranslation>["t"];

export type ResolutionActionId = "DECRYPT" | "REPAIR";

/** A tool retry is an endpoint plus client-held parameters; a policy retry is a stored pair. */
export type RetryTarget =
  | { readonly kind: "tool"; readonly payload: RetryPayload }
  | { readonly kind: "policy"; readonly policy: PolicyRetryTarget };

/** A document a fix produced, and the original to version it under, or null to add it instead. */
export interface ProducedDocument {
  file: File;
  originalId: FileId | null;
}

/** As {@link RetryOutcome}, with the outputs paired to what they replace. */
export interface ProduceOutcome {
  ok: boolean;
  reason?: RetryFailure;
  message?: string | null;
  produced?: ProducedDocument[];
}

/** The tool-origin second half: re-run the stashed operation over what the fix produced. */
export interface ToolRerun {
  run(payload: RetryPayload, files: File[]): Promise<RetryOutcome>;
  notAdopted(t: Translate): string;
}

export interface Resolution {
  actionId: ResolutionActionId;
  /** The tool whose manual run counts as this resolution too. */
  toolId: ToolId;
  needsPassword: boolean;
  produce(
    target: RetryTarget,
    context: NotificationActionContext,
    password?: string,
  ): Promise<ProduceOutcome>;
  /** Absent when `produce` already re-ran the failed operation, as an unlock does. */
  toolRerun?: ToolRerun;
  adoptFailed(t: Translate): string;
  notRerun(t: Translate): string;
  rerunUndelivered(t: Translate): string;
}

export interface ResolutionDeps {
  t: Translate;
  fileContext: ContextType<typeof FileActionsContext>;
  fileStore: ContextType<typeof FileStoreContext>;
}

/** Which of the two a notification describes, or null when nothing here can re-run it. */
export function retryTargetOf(
  context: NotificationActionContext,
): RetryTarget | null {
  const { notification, hasLocalFile, retryPayload } = context;
  if (!hasLocalFile) return null;

  // The policy shape wins where it applies, being the more specific claim.
  const attended = (notification.sourceId ?? null) === null;
  if (attended && notification.policyId && notification.fileId) {
    // No target at all when the policy cannot be placed, rather than one that submits a run
    // whose output never arrives: the row would stay open and bill again on the next press.
    return canPlacePolicy(notification.policyId)
      ? {
          kind: "policy",
          policy: {
            policyId: notification.policyId,
            fileId: notification.fileId,
          },
        }
      : null;
  }

  // One stash per file, but one incident per kind per file, so the stash may be another row's.
  return retryPayload && stashMatchesKind(notification.kindId, retryPayload)
    ? { kind: "tool", payload: retryPayload }
    : null;
}

/** A policy re-run also needs the editor's providers, to collect its output. */
export function canRetry(
  context: NotificationActionContext,
  fileContext: ContextType<typeof FileActionsContext>,
): boolean {
  const target = retryTargetOf(context);
  if (!target) return false;
  return target.kind === "tool" || fileContext !== undefined;
}

/**
 * The stash forgets passwords on purpose, so a tool re-run without them would produce the wrong
 * file and call it fixed. Such a row keeps its plain retry, which opens the tool instead.
 */
function toolRerunWouldBeWrong(
  resolution: Resolution,
  target: RetryTarget | null,
): boolean {
  return (
    target?.kind === "tool" &&
    resolution.toolRerun !== undefined &&
    target.payload.secretsStripped
  );
}

/** The stashed `params` stay stashed: `useBaseParameters` has no seam for initial values. */
export function toolOf(payload: RetryPayload): ToolId | null {
  return isValidToolId(payload.operation) ? payload.operation : null;
}

export function asFile(output: RetryOutputFile): File {
  return new File([output.blob], output.filename, {
    type: output.blob.type || "application/pdf",
  });
}

export function asFiles(outputs: RetryOutputFile[]): File[] {
  return outputs.map(asFile);
}

export function unavailable(t: Translate): ClientActionOutcome {
  return {
    ok: false,
    message: t(
      "notifications.retryUnavailable",
      "This document can no longer be retried from this browser.",
    ),
  };
}

/** The service reports why and this layer words it, because the wording belongs where `t` is. */
function retryFailure(
  t: Translate,
  outcome: RetryOutcome | ProduceOutcome,
): ClientActionOutcome {
  if (outcome.reason === "fileMissing") {
    return {
      ok: false,
      message: t(
        "notifications.notOnThisDevice",
        "This document is not on this device, so it cannot be opened or retried here.",
      ),
    };
  }
  if (outcome.reason === "notRetryable") return unavailable(t);
  // The server's own words, or nothing: the row falls back to its generic failure line.
  return { ok: false, message: outcome.message ?? undefined };
}

/**
 * An untracked run is a failure on purpose: nothing here will collect what it produces. With a
 * `resolution` the copy names what already happened to the document, because the user is left
 * holding it either way; without one it is a plain re-run.
 */
export function rerunOutcome(
  t: Translate,
  outcome: PolicyRerunOutcome,
  resolution: Resolution | null,
): ClientActionOutcome {
  if (outcome.ok && outcome.tracked) return { ok: true };
  if (outcome.ok) {
    return {
      ok: false,
      message: resolution
        ? resolution.rerunUndelivered(t)
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
  if (resolution) return { ok: false, message: resolution.notRerun(t) };
  return {
    ok: false,
    message:
      outcome.message ??
      t(
        "notifications.rerunRejected",
        "The policy could not be run again just now. Try again in a moment.",
      ),
  };
}

/** Storage too, or a file merely closed in the sidebar gets a copy rather than a version. */
async function parentStubFor(
  fileStore: ContextType<typeof FileStoreContext>,
  fileId: FileId,
): Promise<StirlingFileStub | null> {
  return (
    fileStore?.getState().files.byId?.[fileId] ??
    (await fileStorage.getStirlingFileStub(fileId)) ??
    null
  );
}

export function resolutionSpec(
  resolution: Resolution,
  { t, fileContext, fileStore }: ResolutionDeps,
): ClientActionSpec {
  /** Versioned under its original where that is still held here, added on its own otherwise. */
  const take = async (
    actions: NonNullable<typeof fileContext>["actions"],
    document: ProducedDocument,
  ): Promise<FileId[]> => {
    const parent = document.originalId
      ? await parentStubFor(fileStore, document.originalId)
      : null;
    return parent
      ? versionUnder(actions, parent, document.file, resolution.toolId)
      : addToWorkbench(actions, document.file);
  };

  return {
    // A produced document needs somewhere to land, so the processor shell promotes past this.
    available: (context) =>
      fileContext !== undefined &&
      canRetry(context, fileContext) &&
      !toolRerunWouldBeWrong(resolution, retryTargetOf(context)),
    needsPassword: resolution.needsPassword,
    // On success the adopted document is the destination, and it is behind the panel.
    closesPanel: true,
    run: async (context, password): Promise<ClientActionOutcome> => {
      const target = retryTargetOf(context);
      if (
        !target ||
        (resolution.needsPassword && !password) ||
        !fileContext ||
        toolRerunWouldBeWrong(resolution, target)
      ) {
        return unavailable(t);
      }

      const outcome = await resolution.produce(target, context, password);
      if (!outcome.ok) return retryFailure(t, outcome);
      const produced = outcome.produced ?? [];

      if (target.kind === "policy") {
        // A failed adoption fails the action: dropping the result leaves them nothing.
        const adopted: FileId[] = [];
        try {
          for (const document of produced) {
            adopted.push(...(await take(fileContext.actions, document)));
          }
        } catch {
          return { ok: false, message: resolution.adoptFailed(t) };
        }

        // Under the ORIGINAL reference so a repeat folds on, and after the adoption.
        const document = produced[0];
        const rerun: PolicyRerunOutcome = document
          ? await rechainPolicyOnDocument(
              target.policy,
              document.file,
              adopted[0] ?? null,
            )
          : { ok: false, reason: "missingFile" };
        // Anything short of a tracked run stops here: the input alone is not the result.
        const result = rerunOutcome(t, rerun, resolution);
        if (!result.ok) return result;
      } else if (resolution.toolRerun) {
        // Nothing is adopted until the re-run has passed. A repaired input that still fails
        // would otherwise replace the original, and every further press would add another.
        const rerun = await resolution.toolRerun.run(
          target.payload,
          produced.map((document) => document.file),
        );
        if (!rerun.ok) return retryFailure(t, rerun);
        // Only the output, and added rather than versioned: the originals stay as they were. A
        // merge repairs every input to re-run at all, but the siblings that were never damaged
        // must not be swapped for rewritten copies.
        try {
          for (const file of asFiles(rerun.files ?? [])) {
            await addToWorkbench(fileContext.actions, file);
          }
        } catch {
          return { ok: false, message: resolution.toolRerun.notAdopted(t) };
        }
      } else {
        // `produce` already re-ran the operation, so what it made is the result.
        try {
          for (const document of produced)
            await take(fileContext.actions, document);
        } catch {
          return { ok: false, message: resolution.adoptFailed(t) };
        }
      }

      // Ignored on purpose: a refused resolve is not a failed fix.
      await reportNotificationResolved(context.notification.id);
      // The stash described the run that just succeeded, so it has nothing left to offer.
      await clearRetryPayload(context.notification.fileId);
      return { ok: true };
    },
  };
}
