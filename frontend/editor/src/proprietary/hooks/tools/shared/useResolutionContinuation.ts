import { useCallback } from "react";
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

// "Decrypt and retry" is just the remove-password tool, so reaching it directly asks the same.

/** Which tool's success counts as a kind's resolution. The server still decides WHO may fix it. */
const RESOLUTION_TOOLS: Record<string, string> = {
  INPUT_PASSWORD_PROTECTED: "removePassword",
};

export function useResolutionContinuation(): (run: SucceededToolRun) => void {
  return useCallback((run: SucceededToolRun) => {
    void continueResolutions(run);
  }, []);
}

/** Best-effort: a continuation that cannot happen leaves the row where it already was. */
async function continueResolutions(run: SucceededToolRun): Promise<void> {
  try {
    if (!(await couldResolveAnything(run))) return;

    const { notifications } = await fetchNotifications();
    // Only the reader's own rows: fixing a colleague's document by hand closes nothing.
    const candidates = notifications.filter(
      (row) =>
        row.ownership === "MINE" &&
        row.fileId !== null &&
        run.inputFileIds.includes(row.fileId),
    );

    let resolvedAny = false;
    for (const row of candidates) {
      if (await continueRow(row, run)) resolvedAny = true;
    }
    if (resolvedAny) refreshNotificationsNow();
  } catch {
    // Their run succeeded, and the row this could not close still offers the same resolution.
  }
}

/** Answered from local state alone, so an ordinary successful run costs no round-trip. */
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
): Promise<boolean> {
  // Same precedence as the bell's retry target: the policy shape is the more specific claim.
  const attended = (row.sourceId ?? null) === null;
  if (attended && row.policyId && row.fileId) {
    if (RESOLUTION_TOOLS[row.kindId] !== run.operation) return false;
    // The fix is still this reader's to make; it has simply arrived by other means.
    if (!row.actions.some((a) => a.enabled && a.slot === "RESOLUTION")) {
      return false;
    }
    const output = outputFor(row.fileId, run);
    if (!output) return false;

    // As the bell does: the ORIGINAL reference, output attributed to the workbench document.
    const outcome = await rechainPolicyOnDocument(
      { policyId: row.policyId, fileId: row.fileId },
      output.file,
      output.fileId,
    );
    // Anything short of a tracked run leaves the row open: the processed document was the point.
    if (!(outcome.ok && outcome.tracked)) return false;
    return reportNotificationResolved(row.id);
  }

  // A tool failure: resolved when the operation that failed succeeds on the same document.
  if (!row.fileId) return false;
  // Succeeded FOR THIS FILE: a batch can succeed for one input and fail for another.
  if (!outputFor(row.fileId, run)) return false;
  const stash = await loadRetryPayload(row.fileId);
  if (!stash || stash.operation !== run.operation) return false;
  // One stash per file but one incident per kind per file, so the stash may be another row's.
  if (!stashMatchesKind(row.kindId, stash)) return false;
  if (!row.actions.some((a) => a.enabled && a.id === "OPEN_IN_TOOL"))
    return false;
  return reportNotificationResolved(row.id);
}

/** Paired by provenance, or by being the only one. Anything else stays open rather than guess. */
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
