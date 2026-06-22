import { httpJson } from "@portal/api/http";
import type {
  LinkInstanceRequest,
  LinkStatus,
  LinkedInstanceRow,
} from "@portal/mocks/link";

export type {
  LinkInstanceRequest,
  LinkStatus,
  LinkedInstanceRow,
} from "@portal/mocks/link";

/**
 * Account-link client (combined-billing "Mode A"). Two distinct surfaces:
 *
 * THIS instance — the org's own same-origin LOCAL backend:
 *   - POST /api/v1/account-link/link  — hand the local backend the admin's SaaS
 *     JWT. It registers with SaaS and stores the device secret SERVER-SIDE; the
 *     portal NEVER receives or renders the secret.
 *   - GET  /api/v1/account-link/status — Linked / Not-linked for this instance.
 *   - POST /api/v1/account-link/unlink — drop this instance's link.
 *
 * TEAM-WIDE management — the SaaS backend, called with the admin's JWT directly
 * (an attended admin action):
 *   - GET  /api/v1/account-link/instances        — every linked instance.
 *   - POST /api/v1/account-link/instances/{id}/revoke — cut off one instance.
 *
 * Paths mirror the real AccountLinkController so MSW can be dropped with no code
 * change.
 */

const BASE = "/api/v1/account-link";

function authHeaders(accessToken: string | null): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

/**
 * POST /api/v1/account-link/link — link THIS instance. The local backend takes
 * the SaaS JWT, registers with SaaS, and persists the device secret itself; the
 * response carries only the resulting link status. No secret is returned.
 */
export async function linkInstance(
  req: LinkInstanceRequest,
): Promise<LinkStatus> {
  return httpJson<LinkStatus>(`${BASE}/link`, {
    method: "POST",
    body: req,
  });
}

/** GET /api/v1/account-link/status — Linked / Not-linked for this instance. */
export async function fetchStatus(): Promise<LinkStatus> {
  return httpJson<LinkStatus>(`${BASE}/status`);
}

/** POST /api/v1/account-link/unlink — drop this instance's link. */
export async function unlinkInstance(): Promise<LinkStatus> {
  return httpJson<LinkStatus>(`${BASE}/unlink`, { method: "POST" });
}

/**
 * GET /api/v1/account-link/instances — every linked instance for the team.
 * Hits the SaaS backend with the admin's JWT.
 */
export async function fetchInstances(
  accessToken: string | null,
): Promise<LinkedInstanceRow[]> {
  return httpJson<LinkedInstanceRow[]>(`${BASE}/instances`, {
    headers: authHeaders(accessToken),
  });
}

/**
 * POST /api/v1/account-link/instances/{id}/revoke — revoke a linked instance.
 * Hits the SaaS backend with the admin's JWT.
 */
export async function revokeInstance(
  accessToken: string | null,
  instanceId: number,
): Promise<void> {
  await httpJson<void>(`${BASE}/instances/${instanceId}/revoke`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
}
