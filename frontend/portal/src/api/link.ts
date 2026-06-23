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
 * TEAM-WIDE management — currently apiClient.mock (MSW-only paths until
 * migrated):
 *   - GET  /api/v1/account-link/instances        — every linked instance
 *   - POST /api/v1/account-link/instances/{id}/revoke
 *
 * TODO(api): migrate the two team-wide calls to apiClient.saas (they belong
 * on the hosted SaaS Java backend; the local backend has no such endpoints).
 * Blocked on configuring MSW handlers to match the SaaS absolute URL so the
 * dev/Storybook flow keeps working.
 */

const BASE = "/api/v1/account-link";

const accessTokenHeaders = (
  accessToken: string | null,
): Record<string, string> =>
  accessToken ? { Authorization: `Bearer ${accessToken}` } : {};

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
 * revoke before clearing the credential locally.
 */
export async function unlinkInstance(): Promise<LinkStatus> {
  return apiClient.local.json<LinkStatus>(`${BASE}/unlink`, { method: "POST" });
}

/**
 * Every linked instance for the team. MSW-only path until migrated to SaaS
 * (the local backend has no such endpoint).
 */
export async function fetchInstances(
  accessToken: string | null,
): Promise<LinkedInstanceRow[]> {
  return apiClient.mock.json<LinkedInstanceRow[]>(`${BASE}/instances`, {
    headers: accessTokenHeaders(accessToken),
  });
}

/**
 * Revoke a linked instance. MSW-only path until migrated to SaaS (the local
 * backend has no such endpoint).
 */
export async function revokeInstance(
  accessToken: string | null,
  instanceId: number,
): Promise<void> {
  await apiClient.mock.json<void>(`${BASE}/instances/${instanceId}/revoke`, {
    method: "POST",
    headers: accessTokenHeaders(accessToken),
  });
}
