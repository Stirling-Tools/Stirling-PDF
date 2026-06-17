import { httpJson } from "@portal/api/http";
import type { PoliciesResponse, Policy } from "@portal/mocks/policies";

/**
 * Policies service layer — the backend contract.
 *
 * Unlike every other portal surface (which use the mock `/v1/...` base), this
 * one calls the REAL Stirling policy API base `/api/v1/policies` so it is
 * genuinely plug-and-play: drop MSW and these exact calls hit the live backend
 * (PolicyController). The list response is the portal's catalogue shape; the
 * single-policy / create / delete / run calls match the backend records.
 */

export type {
  CatalogueEntry,
  DecoratedPolicy,
  InputSpec,
  OutputSpec,
  PipelineStep,
  PoliciesResponse,
  PoliciesSummary,
  Policy,
  PolicyActivityItem,
  PolicyCategory,
  PolicyConfigDef,
  PolicyField,
  PolicyFieldType,
  PolicyRowStatus,
  PolicySetupResult,
  PolicySource,
  PolicyState,
  PolicyStats,
  PolicyStatus,
  TriggerConfig,
} from "@portal/mocks/policies";
export {
  ENDPOINT_LABELS,
  POLICY_CATEGORIES,
  POLICY_CONFIG,
  POLICY_DOC_TYPES,
  POLICY_SOURCES,
  TOOL_ENDPOINTS,
  humanizeEndpoint,
} from "@portal/mocks/policies";

/** GET /api/v1/policies — the catalogue + every configured policy. */
export async function fetchPolicies(): Promise<PoliciesResponse> {
  return httpJson<PoliciesResponse>("/api/v1/policies");
}

/** GET /api/v1/policies/{id} — one stored policy's raw record. */
export async function fetchPolicy(id: string): Promise<Policy> {
  return httpJson<Policy>(`/api/v1/policies/${encodeURIComponent(id)}`);
}

/**
 * POST /api/v1/policies — create (blank id) or update (matched id). The backend
 * assigns owner + team server-side and returns the stored policy with its id.
 */
export async function savePolicy(policy: Policy): Promise<Policy> {
  return httpJson<Policy>("/api/v1/policies", { method: "POST", body: policy });
}

/** DELETE /api/v1/policies/{id} — remove a stored policy. */
export async function deletePolicy(id: string): Promise<void> {
  await httpJson<void>(`/api/v1/policies/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/** The async run acknowledgement: a run id to poll for status. */
export interface PolicyRunResponse {
  status: boolean;
  /** The run id (poll GET /api/v1/policies/run/{id} for status). */
  fileId: string | null;
  message: string | null;
}

/**
 * POST /api/v1/policies/{id}/run — run a stored policy now. The real endpoint
 * is multipart (the documents to process); the portal has no files to attach,
 * so this triggers the policy on whatever the backend has queued and returns a
 * run id. Runs regardless of the policy's enabled flag.
 */
export async function runPolicy(id: string): Promise<PolicyRunResponse> {
  return httpJson<PolicyRunResponse>(
    `/api/v1/policies/${encodeURIComponent(id)}/run`,
    { method: "POST" },
  );
}
