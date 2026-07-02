/**
 * Export-time policy enforcement. A policy whose `runOn` is "export" runs its
 * pipeline on a file just before it leaves the editor; the enforced result is
 * what gets exported. Core export handlers reach this via the `@app/*` alias
 * (the open-source build ships a no-op stub).
 *
 * Export is never hard-blocked: on failure the original file is exported and a
 * warning toast is shown. For "new version" policies, the run is also recorded
 * so the mounted import effect versions the in-editor file, not just the
 * download. Only PDFs are enforced.
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
import { POLICIES_ENABLED } from "@app/constants/featureFlags";
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
  categoryId: string;
  backendId: string;
  label: string;
  outputMode: "new_file" | "new_version";
  /** The policy's accent as a CSS colour, for the toast glow. */
  accent: string;
}

interface PolicyRunResult {
  file: File;
  runId: string;
  target: PolicyExecutionTarget;
  outputs: { fileId: string; fileName: string }[];
}

/** Configured, active policies set to enforce on export (read from the cache). */
function activeExportPolicies(): ExportPolicy[] {
  if (!POLICIES_ENABLED) return [];
  const labels = new Map(
    loadPolicyCatalog().categories.map((c) => [c.id, c.label]),
  );
  return Object.entries(loadPolicies())
    .filter(
      ([, s]) =>
        s.configured &&
        s.status === "active" &&
        s.backendId &&
        (s.sources.length === 0 || s.sources.includes("editor")) &&
        s.runOn === "export",
    )
    .map(([id, s]) => ({
      categoryId: id,
      backendId: s.backendId as string,
      label: labels.get(id) ?? "Policy",
      outputMode: s.outputMode === "new_file" ? "new_file" : "new_version",
      accent: `var(--color-${ROW_ACCENT[id] ?? "blue"})`,
    }));
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

/**
 * Enforce every active export-policy on each PDF just before export, returning
 * the files in order (enforced, or the original on failure). `fileIds[i]` is the
 * workspace id of `files[i]` when known — used to version the in-editor file for
 * "new version" policies. Non-PDFs pass through untouched, and a single toast
 * (glowing in the policy's accent while it runs) fades a few seconds after the
 * result.
 */
export async function enforceExportPolicies(
  files: File[],
  fileIds?: (string | undefined)[],
  trigger: EnforcementTrigger = "export",
): Promise<File[]> {
  const active = activeExportPolicies();
  const targets = files.flatMap((f, i) => (isPdf(f) ? [i] : []));
  if (!active.length || targets.length === 0) return files;

  // Policies that haven't already enforced this exact file version. Enforcing
  // versions the in-editor file to the policy's output and marks that output
  // dispatched, so an unedited re-export skips re-running — re-applying a
  // non-idempotent policy would stack watermarks/flattens. Editing produces a
  // new file id that isn't dispatched, so an edited file enforces afresh.
  const pendingFor = (fileId: string | undefined) =>
    active.filter((p) => !(fileId && isDispatched(p.categoryId, fileId)));
  if (!targets.some((i) => pendingFor(fileIds?.[i]).length > 0)) return files;

  const names = active.map((p) => p.label).join(", ");

  // Serialise through the enforcement queue: one policy run in flight at a time
  // (the backend rejects concurrent runs under load), and the user can see
  // what's pending. Export, print and convert all share this queue.
  return runQueued({ label: names, trigger }, async () => {
    // An earlier queued job may have just enforced these same files and marked
    // them dispatched, so re-check at run time before doing (or announcing) work.
    if (!targets.some((i) => pendingFor(fileIds?.[i]).length > 0)) return files;

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
    let failures = 0;
    let done = 0;
    for (const i of pending) {
      const file = files[i];
      const fileId = fileIds?.[i];
      const toRun = pendingFor(fileId);
      try {
        let current = file;
        // The last "new version" policy's output is what versions the editor
        // file (recording every policy would double-consume the same input).
        let versionRun: (PolicyRunResult & { categoryId: string }) | undefined;
        for (const policy of toRun) {
          const result = await runToCompletion(policy.backendId, current);
          current = result.file;
          if (policy.outputMode === "new_version" && fileId) {
            versionRun = { ...result, categoryId: policy.categoryId };
          }
        }
        out[i] = current;
        done += 1;
        if (done < total)
          updateToast(toastId, {
            title: progressTitle(done),
            body: progressBody(done),
          });
        if (versionRun && fileId) {
          recordRunStart({
            runId: versionRun.runId,
            categoryId: versionRun.categoryId,
            fileId,
            fileName: file.name,
            fileSize: file.size,
            target: versionRun!.target,
            status: "COMPLETED",
            outputs: versionRun.outputs,
            error: null,
            startedAt: Date.now(),
          });
        }
      } catch {
        failures += 1; // leave out[i] as the original — never hard-block.
      }
    }

    updateToast(
      toastId,
      failures
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
    return out;
  });
}
