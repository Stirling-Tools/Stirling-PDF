import { apiClient } from "@portal/api/http";
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
 * THIS instance — apiClient.local (Spring admin bearer auto-attached):
 *   - POST /api/v1/account-link/link    — hand the local backend the admin's
 *                                          SaaS JWT in the body. It registers
 *                                          with SaaS + stores the device
 *                                          secret SERVER-SIDE; the portal
 *                                          NEVER receives or renders it.
 *   - GET  /api/v1/account-link/status  — Linked / Not-linked for this
 *                                          instance.
 *   - POST /api/v1/account-link/unlink  — drop this instance's link (local
 *                                          backend best-effort tells SaaS).
 *
 * TEAM-WIDE management — apiClient.saas (admin's Supabase JWT auto-attached
 * from the in-app account-link login):
 *   - GET  /api/v1/account-link/instances        — every linked instance
 *   - POST /api/v1/account-link/instances/{id}/revoke
 *
 * The team-wide endpoints are served by the hosted SaaS Java backend (the
 * local backend has no such routes), so they go through apiClient.saas. They're
 * MSW-intercepted in dev/Storybook via wildcard handlers that match both the
 * local and absolute SaaS URLs.
 */

const BASE = "/api/v1/account-link";

/**
 * Link THIS instance. The local backend takes the SaaS JWT, registers with
 * SaaS, and persists the device secret itself; the response carries only the
 * resulting link status. No secret is returned.
 */
export async function linkInstance(
  req: LinkInstanceRequest,
): Promise<LinkStatus> {
  return apiClient.local.json<LinkStatus>(`${BASE}/link`, {
    method: "POST",
    body: req,
  });
}

/** Linked / Not-linked for this instance. */
export async function fetchStatus(): Promise<LinkStatus> {
  return apiClient.local.json<LinkStatus>(`${BASE}/status`);
}

/**
 * Drop this instance's link. The local backend best-effort tells SaaS to
 * revoke before clearing the credential locally, then returns 204 — there's no
 * body, so the caller sets the known unlinked status itself.
 */
export async function unlinkInstance(): Promise<void> {
  await apiClient.local.json<void>(`${BASE}/unlink`, { method: "POST" });
}

/**
 * Every linked instance for the team — SaaS-direct call with the admin's
 * Supabase JWT (no longer takes an accessToken parameter; the saas client
 * resolves the live session itself).
 */
export async function fetchInstances(): Promise<LinkedInstanceRow[]> {
  return apiClient.saas.json<LinkedInstanceRow[]>(`${BASE}/instances`);
}

/**
 * Revoke a linked instance — SaaS-direct call with the admin's Supabase JWT.
 */
export async function revokeInstance(instanceId: number): Promise<void> {
  await apiClient.saas.json<void>(`${BASE}/instances/${instanceId}/revoke`, {
    method: "POST",
  });
}
