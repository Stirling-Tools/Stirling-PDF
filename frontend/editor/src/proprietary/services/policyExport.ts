/**
 * Export-time policy enforcement. A policy whose `runOn` is "export" runs its
 * pipeline on a file just before it leaves the editor; the enforced result is
 * what gets exported. Core export handlers reach this via the `@app/*` alias
 * (the open-source build ships a no-op stub).
 *
 * Required-policy failures cancel the export; ordinary pipeline failures warn.
 * For "new version" policies, the run is also recorded
 * so the mounted import effect versions the in-editor file, not just the
 * download. Each policy selects files using its first step's accepted inputs.
 */

import { dispatchPolicyFile } from "@app/services/policyDispatch";
import { loadPolicies } from "@app/services/policyStorage";
import { assertFilesNotBlocked } from "@app/services/policyFileGuard";
import { loadPolicyCatalog } from "@app/services/policyCatalog";
import { editorTriggerOf } from "@app/policies/runOn";
import { policyAcceptsFile } from "@app/services/policyInput";
import { splitFileName } from "@app/utils/fileUtils";
import {
  runStoredPolicy,
  getPolicyRun,
  downloadPolicyOutput,
  resolvePolicyRunTarget,
} from "@app/services/policyApi";
import type { PolicyExecutionTarget } from "@app/services/policyPipeline";
import type { PolicyState } from "@app/types/policies";
import {
  recordRunStart,
  isDispatched,
  markDispatched,
} from "@app/components/policies/policyRunStore";
import {
  runQueued,
  type EnforcementTrigger,
} from "@app/components/policies/enforcementQueue";
import { ROW_ACCENT } from "@app/components/policies/policyStatus";
import { alert, updateToast, dismissToast } from "@app/components/toast";
import i18n from "@app/i18n";

/** Poll cadence + cap for a single export run (≈2.5 min worst case). */
const POLL_MS = 2000;
const MAX_POLLS = 75;
/** How long the result toast lingers before fading out. */
const TOAST_LINGER_MS = 10_000;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface ExportPolicy extends Pick<PolicyState, "firstOperation"> {
  policyKey: string;
  backendId: string;
  label: string;
  outputMode: "new_file" | "new_version";
  externalOutput?: boolean;
  required: boolean;
  /** The policy's accent as a CSS colour, for the toast glow. */
  accent: string;
}

interface PolicyRunResult {
  file: File;
  runId: string;
  target: PolicyExecutionTarget;
  outputs: { fileId: string; fileName: string }[];
  externalOutput?: boolean;
}

/** Configured, active policies set to enforce on export (read from the cache). */
function activeExportPolicies(): ExportPolicy[] {
  const labels = new Map(
    loadPolicyCatalog().categories.map((c) => [c.id, c.label]),
  );
  return (
    Object.entries(loadPolicies())
      .filter(([, s]) => editorTriggerOf(s) === "export")
      // Same team-wide run order the upload path uses: enforcement is not commutative (a watermark
      // then a flatten is not a flatten then a watermark), so both paths must agree on the sequence.
      .sort(([, a], [, b]) => (a.order ?? 0) - (b.order ?? 0))
      .map(([id, s]) => ({
        policyKey: id,
        backendId: s.backendId as string,
        externalOutput: s.externalOutput,
        firstOperation: s.firstOperation,
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
      if (view.externalOutput)
        return {
          file,
          runId,
          target,
          outputs: view.outputs ?? [],
          externalOutput: true,
        };
      const out = view.outputs?.[0];
      if (!out) throw new Error("policy produced no output");
      const blob = await downloadPolicyOutput(out.fileId, target);
      // Downstream policies must see the output's type, including its extension when MIME is absent.
      const enforced = new File([blob], out.fileName, {
        type: blob.type,
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

/**
 * Enforce compatible active export policies just before export, returning
 * the files in order; required failures throw before export. `fileIds[i]` is the
 * workspace id of `files[i]` when known — used to version the in-editor file for
 * "new version" policies. Incompatible files pass through untouched, and a single toast
 * (glowing in the policy's accent while it runs) fades a few seconds after the
 * result.
 */
export async function enforceExportPolicies(
  files: File[],
  fileIds?: (string | undefined)[],
  trigger: EnforcementTrigger = "export",
): Promise<File[]> {
  assertFilesNotBlocked(fileIds);
  const policies = activeExportPolicies();
  const active = policies.filter((policy) => !policy.externalOutput);
  const external = policies.filter((policy) => policy.externalOutput);
  for (const [i, file] of files.entries()) {
    const fileId = fileIds?.[i];
    for (const policy of external) {
      if (!policyAcceptsFile(policy, file)) continue;
      if (fileId && isDispatched(policy.policyKey, fileId)) continue;
      if (fileId) markDispatched(policy.policyKey, fileId);
      void dispatchPolicyFile(
        policy.policyKey,
        policy.backendId,
        file,
        fileId,
        false,
        true,
      );
    }
  }
  if (!active.length || files.length === 0) return files;

  // Policies that haven't already enforced this exact file version. Enforcing
  // versions the in-editor file to the policy's output and marks that output
  // dispatched, so an unedited re-export skips re-running — re-applying a
  // non-idempotent policy would stack watermarks/flattens. Editing produces a
  // new file id that isn't dispatched, so an edited file enforces afresh.
  const pendingFor = (fileId: string | undefined) =>
    active.filter((p) => !(fileId && isDispatched(p.policyKey, fileId)));
  const hasCompatiblePolicy = (i: number) =>
    pendingFor(fileIds?.[i]).some((policy) =>
      policyAcceptsFile(policy, files[i]),
    );
  const targets = files.flatMap((_, i) => (hasCompatiblePolicy(i) ? [i] : []));
  if (targets.length === 0) return files;

  const names = active.map((p) => p.label).join(", ");

  // Serialise through the enforcement queue: one policy run in flight at a time
  // (the backend rejects concurrent runs under load), and the user can see
  // what's pending. Export, print and convert all share this queue.
  const enforced = await runQueued({ label: names, trigger }, async () => {
    assertFilesNotBlocked(fileIds);
    // An earlier queued job may have just enforced these same files and marked
    // them dispatched, so re-check at run time before doing (or announcing) work.
    if (!targets.some(hasCompatiblePolicy)) return files;

    const pending = targets.filter(hasCompatiblePolicy);
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
    let failures = 0;
    let requiredFailure = false;
    let done = 0;
    for (const i of pending) {
      const file = files[i];
      const fileId = fileIds?.[i];
      const toRun = pendingFor(fileId);
      let runningPolicy: ExportPolicy | undefined;
      try {
        let current = file;
        let optionalFailure = false;
        // The last "new version" policy's output is what versions the editor
        // file (recording every policy would double-consume the same input).
        let versionRun: (PolicyRunResult & { policyKey: string }) | undefined;
        for (const policy of toRun) {
          if (!policyAcceptsFile(policy, current)) continue;
          runningPolicy = policy;
          try {
            const result = await runToCompletion(policy.backendId, current);
            current = result.file;
            if (policy.outputMode === "new_version" && fileId) {
              versionRun = { ...result, policyKey: policy.policyKey };
            }
          } catch (error) {
            if (policy.required) throw error;
            // An optional failure must not skip a required policy later in the chain.
            optionalFailure = true;
          }
        }
        const [base, inputExtension] = splitFileName(file.name);
        const [, outputExtension] = splitFileName(current.name);
        out[i] = new File(
          [current],
          base + (outputExtension || inputExtension),
          { type: current.type },
        );
        done += 1;
        if (done < total)
          updateToast(toastId, {
            title: progressTitle(done),
            body: progressBody(done),
          });
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
        if (optionalFailure) failures += 1;
      } catch {
        failures += 1;
        if (runningPolicy?.required) requiredFailure = true;
      }
    }

    updateToast(
      toastId,
      failures
        ? {
            alertType: "warning",
            title: i18n.t("policies.enforcement.failureTitle"),
            body: requiredFailure
              ? i18n.t("policy.exportBlocked")
              : i18n.t("policies.enforcement.failureBody", {
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
    if (requiredFailure) throw new Error(i18n.t("policy.exportBlocked"));
    return out;
  });
  assertFilesNotBlocked(fileIds);
  return enforced;
}
