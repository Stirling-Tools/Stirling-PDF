/**
 * Client for the backend Policies engine (`/api/v1/policies`). Runs a
 * pipeline on the server — the "backend automation" path — and polls its status.
 * Outputs are downloaded via the existing `/api/v1/general/files/{id}` endpoint
 * using the file ids in the run view.
 */

import apiClient from "@app/services/apiClient";
import type {
  BackendPipelineDefinition,
  BackendPolicy,
  PolicyRunView,
} from "@app/services/policyPipeline";

interface JobResponse {
  async: boolean;
  jobId: string;
  result: unknown;
}

// --- Policy config persistence (server-side store, JPA-backed) ---

/** Create or update a policy; the backend assigns a blank id and returns it. */
export async function savePolicy(
  policy: BackendPolicy,
): Promise<BackendPolicy> {
  const res = await apiClient.post<BackendPolicy>("/api/v1/policies", policy);
  return res.data;
}

/** List all stored policies. */
export async function listPolicies(): Promise<BackendPolicy[]> {
  const res = await apiClient.get<BackendPolicy[]>("/api/v1/policies", {
    suppressErrorToast: true,
  });
  return res.data;
}

/** Fetch a stored policy by id. */
export async function getPolicy(id: string): Promise<BackendPolicy> {
  const res = await apiClient.get<BackendPolicy>(
    `/api/v1/policies/${encodeURIComponent(id)}`,
  );
  return res.data;
}

/** Delete a stored policy by id. */
export async function deletePolicy(id: string): Promise<void> {
  await apiClient.delete(`/api/v1/policies/${encodeURIComponent(id)}`);
}

/** Run a stored policy by id on the supplied files; returns the run id. */
export async function runStoredPolicy(
  id: string,
  files: File[],
): Promise<string> {
  const form = new FormData();
  for (const file of files) form.append("fileInput", file);
  const res = await apiClient.post<JobResponse>(
    `/api/v1/policies/${encodeURIComponent(id)}/run`,
    form,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return res.data.jobId;
}

// --- Ad-hoc pipeline runs (no stored policy) ---

/**
 * Run an ad-hoc pipeline on the backend over the given documents. Returns the
 * run id; poll {@link getPolicyRun} for status + output file ids.
 */
export async function runPolicyPipeline(
  definition: BackendPipelineDefinition,
  files: File[],
): Promise<string> {
  const form = new FormData();
  for (const file of files) form.append("fileInput", file);
  // The backend binds this as a typed @RequestPart, so it must be an application/json part.
  form.append(
    "json",
    new Blob([JSON.stringify(definition)], { type: "application/json" }),
  );
  const res = await apiClient.post<JobResponse>("/api/v1/policies/run", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.jobId;
}

/** Download a run's output file by id (via the shared general-files endpoint). */
export async function downloadPolicyOutput(fileId: string): Promise<Blob> {
  const res = await apiClient.get<Blob>(
    `/api/v1/general/files/${encodeURIComponent(fileId)}`,
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
