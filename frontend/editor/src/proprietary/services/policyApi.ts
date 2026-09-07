/**
 * Client for the backend Policies engine (`/api/v1/policies`). Runs a
 * pipeline on the server — the "backend automation" path — and polls its status.
 * Outputs are downloaded via the existing `/api/v1/general/files/{id}` endpoint
 * using the file ids in the run view.
 */

import apiClient from "@app/services/apiClient";
import { getPolicyOutputBaseUrl } from "@app/services/policyOutputBaseUrl";
import type {
  BackendPolicy,
  PolicyExecutionTarget,
  PolicyRunView,
} from "@app/services/policyPipeline";

interface JobResponse {
  async: boolean;
  jobId: string;
  result: unknown;
}

/** List all stored policies. */
export async function listPolicies(): Promise<BackendPolicy[]> {
  const res = await apiClient.get<BackendPolicy[]>("/api/v1/policies", {
    suppressErrorToast: true,
  });
  return res.data;
}

/**
 * Run a stored policy by id; returns the run id. `fileId` is this workspace's own opaque id, recorded
 * against any failure of the run. Only honoured for a single-document run, and never a filename.
 */
export async function runStoredPolicy(
  id: string,
  files: File[],
  fileId?: string,
): Promise<string> {
  const form = new FormData();
  for (const file of files) form.append("fileInput", file);
  if (fileId) form.append("fileId", fileId);
  // Don't set Content-Type: the HTTP client must generate multipart/form-data
  // WITH its boundary from the FormData body. A manual boundary-less header makes
  // the server reject the request ("no multipart boundary parameter").
  const res = await apiClient.post<JobResponse>(
    `/api/v1/policies/${encodeURIComponent(id)}/run`,
    form,
    { suppressErrorToast: true },
  );
  return res.data.jobId;
}

/**
 * Where a policy run executes, and thus the backend that holds its outputs.
 */
export function resolvePolicyRunTarget(): PolicyExecutionTarget {
  return "saas";
}

/**
 * Download a run's output file by id (via the shared general-files endpoint).
 * `target` is where the run executed: it selects the backend the file is fetched
 * from, so a SaaS run's output isn't looked for on the bundled local backend.
 */
export async function downloadPolicyOutput(
  fileId: string,
  target: PolicyExecutionTarget,
): Promise<Blob> {
  const base = getPolicyOutputBaseUrl(target);
  const res = await apiClient.get<Blob>(
    `${base}/api/v1/general/files/${encodeURIComponent(fileId)}`,
    { responseType: "blob" },
  );
  return res.data;
}

/** Current status, step cursor and output files of a run. */
export async function getPolicyRun(runId: string): Promise<PolicyRunView> {
  const res = await apiClient.get<PolicyRunView>(
    `/api/v1/policies/run/${encodeURIComponent(runId)}`,
  );
  return res.data;
}

/**
 * The caller's in-flight and recently-finished stored-policy runs (server-owned,
 * within the run-retention window). Used to reconcile on load: a run started
 * before a refresh/crash is rediscovered here and its outputs collected, so a
 * finished run is never orphaned on the backend.
 */
export async function listPolicyRuns(): Promise<PolicyRunView[]> {
  const res = await apiClient.get<PolicyRunView[]>("/api/v1/policies/runs");
  return res.data;
}
