import { useCallback } from "react";
import { useAiEngineEnabled } from "@app/hooks/useAiEngineEnabled";
import { refreshNotificationsNow } from "@app/hooks/useNotifications";
import {
  fetchNotifications,
  reportNotificationResolved,
  type AppNotification,
} from "@app/services/notifications";
import {
  loadRetryPayload,
  stashMatchesKind,
} from "@app/services/notificationRetry";
import { rechainPolicyOnDocument } from "@app/services/notificationPolicyRetry";
import type {
  SucceededToolRun,
  ToolRunOutput,
} from "@core/hooks/tools/shared/useResolutionContinuation";

export type { SucceededToolRun, ToolRunOutput };

/**
 * Carry an open failure's resolution through when the user performs it by hand.
 *
 * The bell's "Decrypt and retry" is unlock, re-run, resolve - but the unlock is just the
 * remove-password tool, and a user who reaches it through the tool instead has asked for the
 * same thing. The policy was theirs to run the moment they uploaded the file, so once its
 * blocker is fixed the run continues without asking again; only the fix itself needed them.
 *
 * Everything here is a re-read of what already exists: the row says which policy failed on
 * which document, the server says whether this reader is still offered the fix, and
 * `rechainPolicyOnDocument` is the same continuation the bell uses. Adding a future
 * resolution means one entry in {@link RESOLUTION_TOOLS}; the rest is generic.
 */

/**
 * Which tool's success counts as a kind's resolution performed by hand. The kind's declared
 * resolution stays the authority on WHO may fix it - a row whose resolution the server
 * withheld is left alone however many tools run.
 */
const RESOLUTION_TOOLS: Record<string, string> = {
  INPUT_PASSWORD_PROTECTED: "removePassword",
};

export function useResolutionContinuation(): (run: SucceededToolRun) => void {
  const aiEnabled = useAiEngineEnabled();
  return useCallback(
    (run: SucceededToolRun) => {
      void continueResolutions(run, aiEnabled);
    },
    [aiEnabled],
  );
}

/**
 * Best-effort throughout: the user's own run has already succeeded, and a continuation that
 * cannot happen (row gone, offer withheld, output unmappable) just leaves the row open for
 * the bell, which is where it already was.
 */
async function continueResolutions(
  run: SucceededToolRun,
  aiEnabled: boolean,
): Promise<void> {
  try {
    if (!(await couldResolveAnything(run))) return;

    const { notifications } = await fetchNotifications();
    // Only rows about this run's own inputs, and only the reader's own: a reviewer fixing a
    // colleague's document by hand still cannot close an incident that is not theirs.
    const candidates = notifications.filter(
      (row) =>
        row.ownership === "MINE" &&
        row.fileId !== null &&
        run.inputFileIds.includes(row.fileId),
    );

    let resolvedAny = false;
    for (const row of candidates) {
      if (await continueRow(row, run, aiEnabled)) resolvedAny = true;
    }
    if (resolvedAny) refreshNotificationsNow();
  } catch {
    // Nothing to tell the user: their run succeeded, and the row this could not close is
    // still in the bell offering the same resolution.
  }
}

/**
 * Whether this run could possibly resolve a failure, answered from local state alone, so an
 * ordinary successful run costs no network round-trip.
 */
async function couldResolveAnything(run: SucceededToolRun): Promise<boolean> {
  if (Object.values(RESOLUTION_TOOLS).includes(run.operation)) return true;
  for (const fileId of run.inputFileIds) {
    const stash = await loadRetryPayload(fileId);
    if (stash?.operation === run.operation) return true;
  }
  return false;
}

/** True when the row was resolved server-side, so the caller re-reads the bell once at the end. */
async function continueRow(
  row: AppNotification,
  run: SucceededToolRun,
  aiEnabled: boolean,
): Promise<boolean> {
  // Same precedence as the bell's retry target: the policy shape is the more specific claim.
  const attended = (row.sourceId ?? null) === null;
  if (attended && row.policyId && row.fileId) {
    if (RESOLUTION_TOOLS[row.kindId] !== run.operation) return false;
    // The server still offers this reader the fix; it has simply arrived by other means. A
    // withheld or closed row keeps its own answer.
    if (!row.actions.some((a) => a.enabled && a.slot === "RESOLUTION")) {
      return false;
    }
    const output = outputFor(row.fileId, run);
    if (!output) return false;

    // The same continuation as the bell's unlock: back through the upload chain under the
    // ORIGINAL reference so a repeat folds onto this incident, with the output attributed to
    // the document now in the workbench.
    const outcome = await rechainPolicyOnDocument(
      { policyId: row.policyId, fileId: row.fileId },
      output.file,
      output.fileId,
      aiEnabled,
    );
    // Anything short of a tracked run leaves the row open, exactly as the bell would: the
    // processed document was the point, and an undelivered run has not produced it.
    if (!(outcome.ok && outcome.tracked)) return false;
    return reportNotificationResolved(row.id);
  }

  // A tool failure: resolved when the operation that failed succeeds on the same document.
  if (!row.fileId) return false;
  // Succeeded FOR THIS FILE: a batch can succeed for one input and fail for another
  // without ever reaching the failure path, so being an input of a successful run is
  // not enough - the file must have produced an output.
  if (!outputFor(row.fileId, run)) return false;
  const stash = await loadRetryPayload(row.fileId);
  if (!stash || stash.operation !== run.operation) return false;
  // One stash per file but one incident per kind per file: a stash another kind's
  // failure wrote is not evidence about this row.
  if (!stashMatchesKind(row.kindId, stash)) return false;
  if (!row.actions.some((a) => a.enabled && a.id === "RETRY")) return false;
  return reportNotificationResolved(row.id);
}

/**
 * The run output that stands for the failed document. Paired by provenance where the tool
 * versions its input; a single-in single-out run is unambiguous without it. Anything else is
 * unmappable and the row stays open rather than re-running the policy on a guessed file.
 */
function outputFor(
  fileId: string,
  run: SucceededToolRun,
): ToolRunOutput | null {
  const paired = run.outputs.find((output) => output.sourceFileId === fileId);
  if (paired) return paired;
  if (run.inputFileIds.length === 1 && run.outputs.length === 1) {
    return run.outputs[0];
  }
  return null;
}
