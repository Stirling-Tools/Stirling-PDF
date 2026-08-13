import { recordRunStart } from "@app/components/policies/policyRunStore";
import { fileStorage } from "@app/services/fileStorage";
import { loadPolicies } from "@app/services/policyStorage";
import {
  resolvePolicyRunTarget,
  runStoredPolicy,
} from "@app/services/policyApi";
import type { FileId } from "@app/types/file";

/**
 * Re-running the stored policy that a notification says failed.
 *
 * Nothing is stashed for this: the row names the policy and the workspace's own reference to the
 * document, and the bytes are in this browser's storage under that same reference, so the whole retry
 * is derivable from the row. A tool retry cannot be, which is why `notificationRetry` has a stash.
 *
 * Not a reuse of the auto-run controller, which is a hook. This makes the same single call the
 * auto-run makes and hands it to the same run store, so from there it is like any other run.
 */

/** The document, and the policy to put it back through. Both read straight off the notification. */
export interface PolicyRetryTarget {
  policyId: string;
  /**
   * The workspace reference the failing run was filed against. Sent back unchanged so the server folds
   * a repeat failure onto the same incident.
   */
  fileId: string;
}

/**
 * What became of a re-run, so the caller can say it in the reader's own language. The wording belongs to
 * the component layer, which has `t`.
 *
 * `ok` alone is not enough to act on. A run that went but could not be recorded has no one polling it, so
 * its output never reaches this workspace: nothing about the failure is demonstrably fixed, however
 * cleanly the submission itself went. `tracked` is that difference, and the caller must not close a row
 * on the strength of `ok` without it.
 */
export type PolicyRerunOutcome =
  /** In the store, so `usePolicyAutoRun` polls it to terminal and imports what it produced. */
  | { ok: true; tracked: true }
  /** Running on the server, with nothing here to collect it. See {@link submit}. */
  | { ok: true; tracked: false }
  | { ok: false; reason: "missingFile" }
  /** The server refused the run. `message` is its own, or null when it gave nothing usable. */
  | { ok: false; reason: "rejected"; message: string | null };

/** Re-run on the document still in this browser's storage, under the reference the failure named. */
export async function rerunPolicy(
  target: PolicyRetryTarget,
): Promise<PolicyRerunOutcome> {
  let document: File | null = null;
  try {
    document = await fileStorage.getStirlingFile(target.fileId as FileId);
  } catch {
    // Treated as absent: a browser that will not answer for the file cannot supply its bytes either.
    document = null;
  }
  if (!document) return { ok: false, reason: "missingFile" };

  // The document that failed is still the one in the workspace, so the output belongs to it.
  return submit(target, document, target.fileId);
}

/**
 * Re-run on bytes the caller already holds: the just-unlocked document, which is not in storage under
 * the failing run's reference and never will be.
 *
 * @param workspaceFileId the workspace file this run's output belongs to, which is the ADOPTED document
 *     rather than the one the failure named. Two references on purpose: the server gets the failure's,
 *     so a repeat folds onto the same incident, and the run store gets this one, so the output versions
 *     the document now in front of the user. Null when the adoption produced no id, in which case the
 *     run still goes untracked rather than being filed against the wrong document.
 */
export async function rerunPolicyOnDocument(
  target: PolicyRetryTarget,
  document: File,
  workspaceFileId: string | null,
): Promise<PolicyRerunOutcome> {
  return submit(target, document, workspaceFileId);
}

/**
 * Fire the run, then record it where every other run is recorded. The recording is what makes the retry
 * visible: `usePolicyAutoRun` polls every run in the store to completion and imports its outputs, and
 * that follows from the run being in the store with a real category, hence the lookup below.
 *
 * Two things can stop the recording without stopping the run: a local cache that cannot place the policy,
 * and an adoption that produced no workspace id. Neither is worth refusing the retry over, since the
 * server-side effect is real, but neither is a delivered result either. Both are reported as untracked so
 * the caller can say so and leave the failure open rather than closing a row whose output is not coming.
 */
async function submit(
  target: PolicyRetryTarget,
  document: File,
  workspaceFileId: string | null,
): Promise<PolicyRerunOutcome> {
  // Resolved before the run, so a lookup that throws cannot leave a live run unrecorded.
  const categoryId = categoryForPolicy(target.policyId);
  const runTarget = resolvePolicyRunTarget();

  let runId: string;
  try {
    runId = await runStoredPolicy(target.policyId, [document], target.fileId);
  } catch (error) {
    return { ok: false, reason: "rejected", message: rejectionMessage(error) };
  }

  // Nothing to file it under, or nothing to file it against. The run itself already went, so it is left
  // to run: refusing it now would only add a wasted submission to an undeliverable one.
  if (!categoryId || !workspaceFileId) return { ok: true, tracked: false };

  // Marks (category, file) dispatched as it records, same as any other run: the pair has already run
  // once, and this is that run again rather than a new one to dispatch later.
  recordRunStart({
    runId,
    categoryId,
    fileId: workspaceFileId,
    fileName: document.name,
    fileSize: document.size,
    target: runTarget,
    status: "PENDING",
    outputs: [],
    error: null,
    startedAt: Date.now(),
  });
  return { ok: true, tracked: true };
}

/**
 * The category whose configured policy this is. The non-hook read rather than `usePolicies`, which needs
 * the app-config and team contexts the bell's shell may not have. Same cache the auto-run's reconcile
 * writes, so the same answer.
 */
function categoryForPolicy(policyId: string): string | undefined {
  try {
    return Object.entries(loadPolicies()).find(
      ([, state]) => state.backendId === policyId,
    )?.[0];
  } catch {
    return undefined;
  }
}

/** What the server said, when it said anything readable. Nothing is interpolated here. */
function rejectionMessage(error: unknown): string | null {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (typeof data === "string" && data.trim() !== "") return data;

  const message = (data as { message?: unknown } | undefined)?.message;
  return typeof message === "string" && message.trim() !== "" ? message : null;
}
