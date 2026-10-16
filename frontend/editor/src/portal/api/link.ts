import { apiClient } from "@app/portal/api/http";
import type { LinkedInstanceRow } from "@app/types/linkedInstance";

export type { LinkedInstanceRow };

/** Link status for this instance (GET /api/v1/account-link/status). */
export interface LinkStatus {
  linked: boolean;
  connection?: {
    state: "connected" | "offline" | "expired" | "revoked" | "unlinked";
    lastSuccessAt: string | null;
    offlineAccessUntil: string | null;
  } | null;
  /** Matches the cloud instance row; older status responses may omit it. */
  deviceId?: string | null;
  name?: string | null;
  /** KEY: linked with a key from Stirling Cloud, so no one here holds a cloud sign-in. */
  linkMethod?: "BROWSER" | "KEY" | null;
}

/** What Stirling Cloud last told this server about its plan (GET /api/v1/account-link/plan). */
export interface CloudPlan {
  /** False until the server has heard from Stirling Cloud at least once. */
  known: boolean;
  subscribed: boolean;
  freeRemainingUnits: number;
  prepaidRemainingUnits: number;
  periodSpendUnits: number;
  /** Null when there is no spend limit. */
  periodCapUnits: number | null;
  state: "OK" | "OVER_LIMIT" | "REVOKED" | "UNKNOWN" | null;
  periodStart: string | null;
  periodEnd: string | null;
  licensedUsers: number | null;
  unsyncedUnits: number;
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

/**
 * The instance's own monthly grant. {@code remainingUnits} is floored at 0; dormant while linked.
 */
export interface FreeTierBalance {
  grantUnits: number;
  usedUnits: number;
  remainingUnits: number;
  /** ISO local timestamp, inclusive. */
  periodStart: string;
  /** ISO local timestamp, exclusive — when the grant resets. */
  periodEnd: string;
}

/** Account-link client (combined billing). */

const BASE = "/api/v1/account-link";

/** Linked / Not-linked for this instance. */
export async function fetchStatus(force = false): Promise<LinkStatus> {
  return apiClient.local.json<LinkStatus>(
    `${BASE}/${force ? "recheck" : "status"}`,
    { method: force ? "POST" : "GET" },
  );
}

/**
 * Locally-accrued usage not yet reported to SaaS — the portal adds this on top of the SaaS-synced spend so "current usage" includes work done since the last daily sync.
 */
export async function fetchLocalUsage(): Promise<LocalUsage> {
  return apiClient.local.json<LocalUsage>(`${BASE}/usage`);
}

/**
 * Admin-only server-side, the allowance being instance-wide: a caller must render a 403 as figures
 * it may not see, not as a fault.
 */
export async function fetchFreeTier(): Promise<FreeTierBalance> {
  return apiClient.local.json<FreeTierBalance>(`${BASE}/free-tier`);
}

/** Read from the server's own cache; a key-linked server has no cloud session to ask with. */
export async function fetchCloudPlan(): Promise<CloudPlan> {
  return apiClient.local.json<CloudPlan>(`${BASE}/plan`);
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
  | "UNAVAILABLE"
  | "CALLBACK_MISMATCH";

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
