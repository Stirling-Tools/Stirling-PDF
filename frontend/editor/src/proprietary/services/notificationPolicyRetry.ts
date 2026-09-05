import {
  appliedPoliciesFor,
  recordRunStart,
} from "@app/components/policies/policyRunStore";
import { orderedRewritingPolicies } from "@app/data/classificationPolicy";
import { fileStorage } from "@app/services/fileStorage";
import { loadPolicies } from "@app/services/policyStorage";
import {
  resolvePolicyRunTarget,
  runStoredPolicy,
} from "@app/services/policyApi";
import type { FileId } from "@app/types/file";

// No stash needed: the row names the policy and the reference the bytes are stored under.

/** The document, and the policy to put it back through. Both read straight off the notification. */
export interface PolicyRetryTarget {
  policyId: string;
  /** Sent back unchanged, so the server folds a repeat failure onto the same incident. */
  fileId: string;
}

/** `ok` without `tracked` means nothing polls the run, so no output reaches this workspace. */
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
    // Treated as absent: a browser that will not answer for the file cannot supply its bytes.
    document = null;
  }
  if (!document) return { ok: false, reason: "missingFile" };

  // The document that failed is still the one in the workspace, so the output belongs to it.
  return submit(target, document, target.fileId);
}

/** Rejoins the chain at {@link resumePointFor}; `workspaceFileId` is the ADOPTED document. */
export async function rechainPolicyOnDocument(
  target: PolicyRetryTarget,
  document: File,
  workspaceFileId: string | null,
): Promise<PolicyRerunOutcome> {
  return submit(target, document, workspaceFileId, resumePointFor(target));
}

/** Which policy a retry should actually run, and the key to file its run under. */
interface ChainEntry {
  policyId: string;
  policyKey: string;
}

/**
 * The chain's first policy not already applied, so one that succeeded does not run twice. Null for
 * an annotating policy, which is not in the chain and is simply re-run on its own.
 */
function resumePointFor(target: PolicyRetryTarget): ChainEntry | null {
  const policies = loadPolicies();
  const chain = orderedRewritingPolicies(policies);
  const failed = policyKeyForBackendId(target.policyId);
  if (!failed || !chain.includes(failed)) return null;

  const applied = appliedPoliciesFor(target.fileId);
  const policyKey = chain.find((key) => !applied.has(key));
  if (!policyKey) return null;
  const policyId = Object.entries(policies).find(
    ([id]) => id === policyKey,
  )?.[1]?.backendId;
  return policyId ? { policyId, policyKey } : null;
}

/** Recorded because `usePolicyAutoRun` polls the store; an unrecorded run delivers nothing. */
async function submit(
  target: PolicyRetryTarget,
  document: File,
  workspaceFileId: string | null,
  resume: ChainEntry | null = null,
): Promise<PolicyRerunOutcome> {
  // Resolved before the run, so a lookup that throws cannot leave a live run unrecorded.
  const policyKey = resume?.policyKey ?? policyKeyForBackendId(target.policyId);
  // At the resume point where there is one, so the rest of the chain carries on from there.
  const policyId = resume?.policyId ?? target.policyId;
  const runTarget = resolvePolicyRunTarget();

  let runId: string;
  try {
    runId = await runStoredPolicy(policyId, [document], target.fileId);
  } catch (error) {
    return { ok: false, reason: "rejected", message: rejectionMessage(error) };
  }

  // The run already went, so it is left to run: refusing now only wastes a second submission.
  if (!policyKey || !workspaceFileId) return { ok: true, tracked: false };

  // Marks (policy, file) dispatched as it records: the pair has run once, and this is it again.
  recordRunStart({
    runId,
    policyKey,
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

/** Non-hook read: `usePolicies` needs contexts the bell's shell may not have. */
function policyKeyForBackendId(policyId: string): string | undefined {
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
