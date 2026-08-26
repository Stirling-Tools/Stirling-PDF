import { apiClient } from "@portal/api/http";

/** Link status for this instance (GET /api/v1/account-link/status). */
export interface LinkStatus {
  linked: boolean;
  /** Display name the local backend stored at link time; null when unset. */
  name: string | null;
}

/** Locally-accrued usage not yet reported to SaaS (GET /api/v1/account-link/usage). */
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

/** Account-link client (combined-billing "Mode A"). */

const BASE = "/api/v1/account-link";

/** Linked / Not-linked for this instance. */
export async function fetchStatus(): Promise<LinkStatus> {
  return apiClient.local.json<LinkStatus>(`${BASE}/status`);
}

/**
 * Locally-accrued usage not yet reported to SaaS — the portal adds this on top of the SaaS-synced spend so "current usage" includes work done since the last daily sync.
 */
export async function fetchLocalUsage(): Promise<LocalUsage> {
  return apiClient.local.json<LocalUsage>(`${BASE}/usage`);
}

/** Drop this instance's link. */
export async function unlinkInstance(): Promise<void> {
  await apiClient.local.json<void>(`${BASE}/unlink`, { method: "POST" });
}

/** Nudge the local backend to sync + refresh its cached entitlement now. */
export async function triggerLocalSync(): Promise<void> {
  await apiClient.local.json<void>(`${BASE}/sync-now`, { method: "POST" });
}

/** Where a browser-mediated connect handshake has got to. */
export type ConnectPhase =
  | "NONE"
  | "PENDING"
  | "LINKED"
  | "EXPIRED"
  | "REJECTED"
  | "UNAVAILABLE";

export interface ConnectStatus {
  phase: ConnectPhase;
  /** Approval page to send the admin to. */
  authorizeUrl: string | null;
  secondsRemaining: number | null;
  teamId: number | null;
}

const CONNECT = `${BASE}/connect`;

/** Open a handshake and get the approval URL to send the admin to. */
export async function startConnect(
  name?: string,
  callbackUrl?: string,
): Promise<ConnectStatus> {
  return apiClient.local.json<ConnectStatus>(`${CONNECT}/start`, {
    method: "POST",
    body: { name, callbackUrl },
  });
}

/** Re-establish the SaaS session for a server that is already linked. */
export async function startReauth(
  callbackUrl?: string,
): Promise<ConnectStatus> {
  return apiClient.local.json<ConnectStatus>(`${CONNECT}/reauth`, {
    method: "POST",
    body: { callbackUrl },
  });
}

/** Finish a handshake using the nonce the approval page put in the callback fragment. */
export async function completeConnect(nonce: string): Promise<ConnectStatus> {
  return apiClient.local.json<ConnectStatus>(`${CONNECT}/complete`, {
    method: "POST",
    body: { nonce },
  });
}

/**
 * Every linked instance for the team — SaaS-direct call with the admin's Supabase JWT (no longer takes an accessToken parameter; the saas client resolves the live session itself).
 */
export async function fetchInstances(): Promise<LinkedInstanceRow[]> {
  return apiClient.saas.json<LinkedInstanceRow[]>(`${BASE}/instances`);
}

/** Revoke a linked instance — SaaS-direct call with the admin's Supabase JWT. */
export async function revokeInstance(instanceId: number): Promise<void> {
  await apiClient.saas.json<void>(`${BASE}/instances/${instanceId}/revoke`, {
    method: "POST",
  });
}
