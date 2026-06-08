/**
 * Client for the backend Policies engine (PR #6527, `/api/v1/policies`). Runs a
 * pipeline on the server — the "backend automation" path — and polls its status.
 * Outputs are downloaded via the existing `/api/v1/general/files/{id}` endpoint
 * using the file ids in the run view.
 */

import apiClient from "@app/services/apiClient";
import type {
  BackendPipelineDefinition,
  PolicyRunView,
} from "@app/services/policyPipeline";

interface JobResponse {
  async: boolean;
  jobId: string;
  result: unknown;
}

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
  form.append("json", JSON.stringify(definition));
  const res = await apiClient.post<JobResponse>(
    "/api/v1/policies/run",
    form,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return res.data.jobId;
}

/** Current status, step cursor and output files of a run. */
export async function getPolicyRun(runId: string): Promise<PolicyRunView> {
  const res = await apiClient.get<PolicyRunView>(
    `/api/v1/policies/run/${encodeURIComponent(runId)}`,
  );
  return res.data;
}
