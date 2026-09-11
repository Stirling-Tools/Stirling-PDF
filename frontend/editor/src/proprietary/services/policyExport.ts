/**
 * Export-time policy enforcement. A policy whose `runOn` is "export" runs its
 * pipeline on a file just before it leaves the editor; the enforced result is
 * what gets exported. Core export handlers reach this via the `@app/*` alias
 * (the open-source build ships a no-op stub).
 *
 * Required-policy failure refuses this export without blocking further editing;
 * ordinary pipeline failures warn and preserve successful changes while the chain
 * continues. For "new version" policies, the run is also recorded so the mounted
 * import effect versions the in-editor file, not just the download. Only PDFs are enforced.
 */

import { loadPolicies } from "@app/services/policyStorage";
import { loadPolicyCatalog } from "@app/services/policyCatalog";
import {
  runStoredPolicy,
  getPolicyRun,
  downloadPolicyOutput,
  resolvePolicyRunTarget,
} from "@app/services/policyApi";
import type { PolicyExecutionTarget } from "@app/services/policyPipeline";
import {
  recordRunStart,
  isDispatched,
} from "@app/components/policies/policyRunStore";
import {
  runQueued,
  type EnforcementTrigger,
} from "@app/components/policies/enforcementQueue";
import { ROW_ACCENT } from "@app/components/policies/policyStatus";
import { alert, updateToast, dismissToast } from "@app/components/toast";
import { isFileBlocked } from "@app/services/policyBlockRegistry";
import i18n from "@app/i18n";

/** Poll cadence + cap for a single export run (≈2.5 min worst case). */
const POLL_MS = 2000;
const MAX_POLLS = 75;
/** How long the result toast lingers before fading out. */
const TOAST_LINGER_MS = 10_000;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isPdf = (f: File) =>
  f.type === "application/pdf" || /\.pdf$/i.test(f.name);

interface ExportPolicy {
  policyKey: string;
  backendId: string;
  label: string;
  outputMode: "new_file" | "new_version";
  /** A policy (blocking): its failure refuses the export, vs an ordinary pipeline that warns. */
  required: boolean;
  /** The policy's accent as a CSS colour, for the toast glow. */
  accent: string;
}

/**
 * The enforced files plus the names of any refused by a failed Policy. When {@link blocked} is
 * non-empty the caller must abort the export (not download/print/convert anything) - a required
 * export policy failed on those files.
 */
export interface ExportEnforcementResult {
  files: File[];
  blocked: string[];
}

interface PolicyRunResult {
  file: File;
  runId: string;
  target: PolicyExecutionTarget;
  outputs: { fileId: string; fileName: string }[];
}

/** Configured, active policies set to enforce on export (read from the cache). */
function activeExportPolicies(): ExportPolicy[] {
  const labels = new Map(
    loadPolicyCatalog().categories.map((c) => [c.id, c.label]),
  );
  return (
    Object.entries(loadPolicies())
      .filter(
        ([, s]) =>
          s.configured &&
          s.enabled &&
          s.backendId &&
          s.runsOnEditor &&
          s.runOn === "export",
      )
      // Same team-wide run order the upload path uses: enforcement is not commutative (a watermark
      // then a flatten is not a flatten then a watermark), so both paths must agree on the sequence.
      .sort(([, a], [, b]) => (a.order ?? 0) - (b.order ?? 0))
      .map(([id, s]) => ({
        policyKey: id,
        backendId: s.backendId as string,
        // A builder pipeline has no built-in category, so it labels by its own name.
        label: labels.get(id) ?? s.name ?? "Policy",
        outputMode: s.outputMode === "new_file" ? "new_file" : "new_version",
        required: s.required === true,
        accent: `var(--color-${ROW_ACCENT[id] ?? "blue"})`,
      }))
  );
}

/** Run one policy on a file and resolve the enforced bytes + run info (throws on
 *  failure). */
async function runToCompletion(
  backendId: string,
  file: File,
): Promise<PolicyRunResult> {
  const target = resolvePolicyRunTarget();
  const runId = await runStoredPolicy(backendId, [file]);
  for (let i = 0; i < MAX_POLLS; i++) {
    await delay(POLL_MS);
    let view;
    try {
      view = await getPolicyRun(runId);
    } catch {
      continue; // transient — keep polling within the cap.
    }
    if (view.status === "COMPLETED") {
      const out = view.outputs?.[0];
      if (!out) throw new Error("policy produced no output");
      const blob = await downloadPolicyOutput(out.fileId, target);
      // Keep the export's filename; only the bytes are the enforced result.
      const enforced = new File([blob], file.name, {
        type: blob.type || file.type || "application/pdf",
      });
      return { file: enforced, runId, target, outputs: view.outputs ?? [] };
    }
    if (view.status === "FAILED" || view.status === "CANCELLED") {
      throw new Error(view.error || `policy run ${view.status.toLowerCase()}`);
    }
    if (view.status === "WAITING_FOR_INPUT") {
      throw new Error(
        "policy requires interactive input and cannot run automatically",
      );
    }
  }
  throw new Error("policy run timed out");
}

function enforcedFilesSummary(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2)
    return i18n.t("policies.enforcement.summaryTwo", {
      first: names[0],
      second: names[1],
    });
  return i18n.t("policies.enforcement.summaryMore", {
    first: names[0],
    second: names[1],
    more: names.length - 2,
  });
}

function refuseBlockedExport(
  files: File[],
  fileIds: (string | undefined)[] | undefined,
): ExportEnforcementResult | undefined {
  const blocked = files.flatMap((file, i) => {
    const id = fileIds?.[i];
    return id && isFileBlocked(id) ? [file.name] : [];
  });
  if (blocked.length === 0) return undefined;
  alert({
    alertType: "error",
    title: i18n.t("policies.enforcement.blockedTitle"),
    body: i18n.t("policies.enforcement.blockedBody", {
      files: enforcedFilesSummary(blocked),
    }),
    expandable: false,
  });
  return { files, blocked };
}

/**
 * Enforce every active export-policy on each PDF just before export, returning
 * the last successfully processed version of each file in order
 * plus `blocked` - the names of files a failed Policy refuses, which the caller must
 * not export. `fileIds[i]` is the workspace id of `files[i]` when known — used to
 * version the in-editor file for "new version" policies. Non-PDFs pass through
 * untouched, and a single toast (glowing in the policy's accent while it runs) fades
 * a few seconds after the result.
 */
export async function enforceExportPolicies(
  files: File[],
  fileIds?: (string | undefined)[],
  trigger: EnforcementTrigger = "export",
): Promise<ExportEnforcementResult> {
  const uploadBlocked = refuseBlockedExport(files, fileIds);
  if (uploadBlocked) return uploadBlocked;

  const active = activeExportPolicies();
  const targets = files.flatMap((f, i) => (isPdf(f) ? [i] : []));
  if (!active.length || targets.length === 0) return { files, blocked: [] };

  // Policies that haven't already enforced this exact file version. Enforcing
  // versions the in-editor file to the policy's output and marks that output
  // dispatched, so an unedited re-export skips re-running — re-applying a
  // non-idempotent policy would stack watermarks/flattens. Editing produces a
  // new file id that isn't dispatched, so an edited file enforces afresh.
  const pendingFor = (fileId: string | undefined) =>
    active.filter((p) => !(fileId && isDispatched(p.policyKey, fileId)));
  if (!targets.some((i) => pendingFor(fileIds?.[i]).length > 0))
    return { files, blocked: [] };

  const names = active.map((p) => p.label).join(", ");

  // Serialise through the enforcement queue: one policy run in flight at a time
  // (the backend rejects concurrent runs under load), and the user can see
  // what's pending. Export, print and convert all share this queue.
  const result = await runQueued({ label: names, trigger }, async () => {
    const blockedAtStart = refuseBlockedExport(files, fileIds);
    if (blockedAtStart) return blockedAtStart;
    // An earlier queued job may have just enforced these same files and marked
    // them dispatched, so re-check at run time before doing (or announcing) work.
    if (!targets.some((i) => pendingFor(fileIds?.[i]).length > 0))
      return { files, blocked: [] };

    const pending = targets.filter((i) => pendingFor(fileIds?.[i]).length > 0);
    const total = pending.length;
    const progressTitle = (done: number) =>
      total === 1
        ? i18n.t("policies.enforcement.applying", { names })
        : i18n.t("policies.enforcement.applyingProgress", {
            names,
            done: done + 1,
            total,
          });
    const progressBody = (done: number) => files[pending[done]].name;

    const toastId = alert({
      alertType: "neutral",
      title: progressTitle(0),
      body: progressBody(0),
      isPersistentPopup: true,
      expandable: false,
      glowColor: active[0].accent,
    });

    const out = [...files];
    const blocked: string[] = [];
    let failures = 0;
    let done = 0;
    for (const i of pending) {
      const file = files[i];
      const fileId = fileIds?.[i];
      const toRun = pendingFor(fileId);
      let current = file;
      // The last "new version" policy's output versions the editor file; recording each consumes it twice.
      let versionRun: (PolicyRunResult & { policyKey: string }) | undefined;
      let fileBlocked = false;
      let pipelineFailed = false;
      for (const policy of toRun) {
        let result;
        try {
          result = await runToCompletion(policy.backendId, current);
        } catch {
          if (policy.required) {
            fileBlocked = true;
            break;
          }
          // Preserve prior enforcement and still run later required policies.
          pipelineFailed = true;
          continue;
        }
        current = result.file;
        if (policy.outputMode === "new_version" && fileId) {
          versionRun = { ...result, policyKey: policy.policyKey };
        }
      }
      if (pipelineFailed) failures += 1;
      done += 1;
      if (done < total)
        updateToast(toastId, {
          title: progressTitle(done),
          body: progressBody(done),
        });
      // A concurrent upload failure must not be consumed into an unblocked editor version.
      if (fileBlocked || (fileId && isFileBlocked(fileId))) {
        blocked.push(file.name);
        continue;
      }
      out[i] = current;
      if (versionRun && fileId) {
        recordRunStart({
          runId: versionRun.runId,
          policyKey: versionRun.policyKey,
          fileId,
          fileName: file.name,
          fileSize: file.size,
          target: versionRun.target,
          status: "COMPLETED",
          outputs: versionRun.outputs,
          error: null,
          startedAt: Date.now(),
        });
      }
    }

    updateToast(
      toastId,
      blocked.length
        ? {
            alertType: "error",
            title: i18n.t("policies.enforcement.blockedTitle"),
            body: i18n.t("policies.enforcement.blockedBody", {
              files: enforcedFilesSummary(blocked),
            }),
            isPersistentPopup: false,
            glowColor: undefined,
          }
        : failures
          ? {
              alertType: "warning",
              title: i18n.t("policies.enforcement.failureTitle"),
              body: i18n.t("policies.enforcement.failureBody", {
                failures,
                total,
              }),
              isPersistentPopup: false,
              glowColor: undefined,
            }
          : {
              alertType: "success",
              title: i18n.t("policies.enforcement.successTitle", { names }),
              body: enforcedFilesSummary(pending.map((i) => files[i].name)),
              isPersistentPopup: false,
              glowColor: undefined,
            },
    );
    // update() doesn't reschedule auto-dismiss, so fade the result out explicitly.
    window.setTimeout(() => dismissToast(toastId), TOAST_LINGER_MS);
    return { files: out, blocked };
  });
  if (result.blocked.length > 0) return result;
  // Recheck the whole batch after the final await, including files whose enforcement was skipped.
  return refuseBlockedExport(result.files, fileIds) ?? result;
}
