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
} from "@app/services/policyApi";
import { recordRunStart } from "@app/components/policies/policyRunStore";
import { ROW_ACCENT } from "@app/components/policies/policyStatus";
import { alert, updateToast, dismissToast } from "@app/components/toast";
import { POLICIES_ENABLED } from "@app/constants/featureFlags";

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
      const blob = await downloadPolicyOutput(out.fileId);
      // Keep the export's filename; only the bytes are the enforced result.
      const enforced = new File([blob], file.name, {
        type: blob.type || file.type || "application/pdf",
      });
      return { file: enforced, runId, outputs: view.outputs ?? [] };
    }
    if (view.status === "FAILED" || view.status === "CANCELLED") {
      throw new Error(view.error || `policy run ${view.status.toLowerCase()}`);
    }
  }
  throw new Error("policy run timed out");
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
): Promise<File[]> {
  const active = activeExportPolicies();
  const targets = files.flatMap((f, i) => (isPdf(f) ? [i] : []));
  if (!active.length || targets.length === 0) return files;

  const names = active.map((p) => p.label).join(", ");
  const toastId = alert({
    alertType: "neutral",
    title: `Applying ${names}`,
    body: `Enforcing ${
      targets.length === 1 ? "your file" : `${targets.length} files`
    } before export…`,
    isPersistentPopup: true,
    expandable: false,
    glowColor: active[0].accent,
  });

  const out = [...files];
  let failures = 0;
  for (const i of targets) {
    const file = files[i];
    const fileId = fileIds?.[i];
    try {
      let current = file;
      // The last "new version" policy's output is what versions the editor file
      // (recording every policy would double-consume the same input).
      let versionRun: PolicyRunResult & { categoryId: string };
      let hasVersionRun = false;
      for (const policy of active) {
        const result = await runToCompletion(policy.backendId, current);
        current = result.file;
        if (policy.outputMode === "new_version" && fileId) {
          versionRun = { ...result, categoryId: policy.categoryId };
          hasVersionRun = true;
        }
      }
      out[i] = current;
      if (hasVersionRun && fileId) {
        recordRunStart({
          runId: versionRun!.runId,
          categoryId: versionRun!.categoryId,
          fileId,
          fileName: file.name,
          fileSize: file.size,
          status: "COMPLETED",
          outputs: versionRun!.outputs,
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
          title: "Exported without full enforcement",
          body: `${failures} of ${targets.length} file(s) couldn't be processed and were exported as-is.`,
          isPersistentPopup: false,
          glowColor: undefined,
        }
      : {
          alertType: "success",
          title: `${names} applied`,
          body: "Enforced before export.",
          isPersistentPopup: false,
          glowColor: undefined,
        },
  );
  // update() doesn't reschedule auto-dismiss, so fade the result out explicitly.
  window.setTimeout(() => dismissToast(toastId), TOAST_LINGER_MS);
  return out;
}
