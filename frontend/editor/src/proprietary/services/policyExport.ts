/**
 * Export-time policy enforcement.
 *
 * A policy whose `runOn` is "export" enforces its pipeline on a file the moment
 * before it leaves the editor: the file's bytes are sent to the backend, the
 * policy runs, and the enforced result is what actually gets exported. The (core)
 * export handlers reach this via the `@app/*` alias; the open-source build ships
 * a no-op stub, so this only does work in the proprietary build.
 *
 * Export is never hard-blocked (product decision): if the run fails or times out
 * the ORIGINAL file is exported and a warning toast is shown, rather than
 * stopping the user from getting their file.
 */

import { loadPolicies } from "@app/services/policyStorage";
import { loadPolicyCatalog } from "@app/services/policyCatalog";
import {
  runStoredPolicy,
  getPolicyRun,
  downloadPolicyOutput,
} from "@app/services/policyApi";
import { alert, updateToast } from "@app/components/toast";
import { POLICIES_ENABLED } from "@app/constants/featureFlags";

/** Poll cadence + cap for a single export run (≈2.5 min worst case). */
const POLL_MS = 2000;
const MAX_POLLS = 75;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface ExportPolicy {
  categoryId: string;
  backendId: string;
  label: string;
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
    }));
}

/** Run one policy on a file and resolve the enforced bytes (throws on failure). */
async function runToCompletion(backendId: string, file: File): Promise<File> {
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
      return new File([blob], file.name, {
        type: blob.type || file.type || "application/pdf",
      });
    }
    if (view.status === "FAILED" || view.status === "CANCELLED") {
      throw new Error(view.error || `policy run ${view.status.toLowerCase()}`);
    }
  }
  throw new Error("policy run timed out");
}

/**
 * Enforce every active export-policy on each file just before export, returning
 * the enforced files (or the original on failure). Shows a single toast for the
 * batch (running → applied / exported-as-is). A no-op when nothing is set to run
 * on export, so non-policy exports are untouched.
 */
export async function enforceExportPolicies(files: File[]): Promise<File[]> {
  const active = activeExportPolicies();
  if (!active.length || !files.length) return files;

  const names = active.map((p) => p.label).join(", ");
  const toastId = alert({
    alertType: "neutral",
    title: `Applying ${names}`,
    body: `Enforcing ${
      files.length === 1 ? "your file" : `${files.length} files`
    } before export…`,
    isPersistentPopup: true,
    expandable: false,
  });

  const out: File[] = [];
  let failures = 0;
  for (const file of files) {
    try {
      let current = file;
      // Apply each active export-policy in turn (each transforms the bytes).
      for (const policy of active) {
        current = await runToCompletion(policy.backendId, current);
      }
      out.push(current);
    } catch {
      failures += 1;
      out.push(file); // export the original — never hard-block.
    }
  }

  if (failures) {
    updateToast(toastId, {
      alertType: "warning",
      title: "Exported without full enforcement",
      body: `${failures} of ${files.length} file(s) couldn't be processed and were exported as-is.`,
      isPersistentPopup: false,
    });
  } else {
    updateToast(toastId, {
      alertType: "success",
      title: `${names} applied`,
      body: "Enforced before export.",
      isPersistentPopup: false,
    });
  }
  return out;
}
