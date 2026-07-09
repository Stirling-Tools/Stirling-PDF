import { apiClient } from "@portal/api/http";

/** Body for POST /api/v1/account-link/link — the SaaS JWT + optional name. */
export interface LinkInstanceRequest {
  /** Admin's SaaS session JWT, obtained via the hosted-login popup. */
  supabaseJwt: string;
  /** Optional label for this instance. */
  name?: string;
}

/** Link status for this instance (GET /api/v1/account-link/status). */
export interface LinkStatus {
  linked: boolean;
  /** Display name the local backend stored at link time; null when unset. */
  name: string | null;
}

/**
 * Locally-accrued usage not yet reported to SaaS (GET /api/v1/account-link/usage).
 * The portal adds this on top of the SaaS-synced spend so "current usage"
 * includes work done since the last daily sync. Per-category unsynced units for
 * the current period; all zero when metering is off or nothing is pending.
 */
export interface LocalUsage {
  /** ISO timestamp of the current period start; null when unknown (not yet synced). */
  periodStart: string | null;
  apiUnsyncedUnits: number;
  aiUnsyncedUnits: number;
  automationUnsyncedUnits: number;
  totalUnsyncedUnits: number;
}

/** A linked instance row (GET /api/v1/account-link/instances). */
export interface LinkedInstanceRow {
  instanceId: number;
  deviceId: string;
  name: string | null;
  /** ISO timestamp the instance was registered. */
  createdAt: string | null;
  /** ISO timestamp the instance last presented its credential; null if never. */
  lastSeenAt: string | null;
  revoked: boolean;
}

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
 * local backend has no such routes), so they go through apiClient.saas. In
 * Storybook/tests, wildcard MSW handlers match both the local and absolute
 * SaaS URLs.
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
 * Locally-accrued usage not yet reported to SaaS — the portal adds this on top
 * of the SaaS-synced spend so "current usage" includes work done since the last
 * daily sync. Local-backend call; returns zeros when metering is off.
 */
export async function fetchLocalUsage(): Promise<LocalUsage> {
  return apiClient.local.json<LocalUsage>(`${BASE}/usage`);
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
 * Nudge the local backend to sync + refresh its cached entitlement now. Called
 * right after a checkout completes so the instance's request-time gate reflects
 * the new subscription immediately instead of waiting out its entitlement-cache
 * TTL. Best-effort — the caller swallows failures (metering off → 409, or the
 * local backend unreachable); the scheduled sync / TTL refresh is the backstop.
 */
export async function triggerLocalSync(): Promise<void> {
  await apiClient.local.json<void>(`${BASE}/sync-now`, { method: "POST" });
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
