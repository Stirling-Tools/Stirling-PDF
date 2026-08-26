import { apiClient } from "@portal/api/http";
import type { Tier } from "@portal/contexts/TierContext";

/* ──────────────────────────────────────────────────────────────────────── */
/*  API Keys                                                                 */
/* ──────────────────────────────────────────────────────────────────────── */

export type ApiKeyStatus = "active" | "revoked";

export interface ApiKey {
  id: string;
  name: string;
  /** Non-secret leading fragment, e.g. "sk_a3f81b2c". */
  prefix: string;
  created: string;
  /** Formatted last-use time, or "Never". */
  lastUsed: string;
  status: ApiKeyStatus;
  /** Requests made today (UTC). */
  usageToday: number;
  /** Requests in the trailing 30 days. */
  usageMonth: number;
  /** Lifetime request count. */
  usageTotal: number;
}

export interface ApiKeysResponse {
  keys: ApiKey[];
}

/** Returned once on creation: the listed row plus the plaintext secret, shown once. */
export interface CreatedApiKey {
  key: ApiKey;
  secret: string;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Audit Logs                                                               */
/* ──────────────────────────────────────────────────────────────────────── */

export type AuditCategory =
  | "auth"
  | "config"
  | "elevation"
  | "policy"
  | "processing"
  | "security";

export type AuditStatus = "success" | "warning" | "danger" | "info";

export interface AuditEvent {
  id: string;
  timestamp: string;
  category: AuditCategory;
  action: string;
  actor: string;
  target: string;
  status: AuditStatus;
  latencyMs: number;
}

export interface AuditSummary {
  totalEvents: number;
  policy: number;
  processing: number;
  elevation: number;
  config: number;
}

export interface AuditLogResponse {
  summary: AuditSummary;
  events: AuditEvent[];
  /** True for the whole-server (admin) view; gates the admin-only CSV export. */
  fullServer: boolean;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Endpoints                                                                */
/* ──────────────────────────────────────────────────────────────────────── */

const q = (tier: Tier) => `?tier=${encodeURIComponent(tier)}`;

const API_KEYS_PATH = "/api/v1/proprietary/ui-data/infrastructure/api-keys";

// Always this instance's own backend: a key authenticates the instance that issued it, so a
// self-hosted instance manages its own keys even when SaaS-linked (.local is the SaaS backend on SaaS).

/** GET the caller's personal API keys; scoped server-side per user. */
export async function fetchApiKeys(): Promise<ApiKeysResponse> {
  return apiClient.local.json<ApiKeysResponse>(API_KEYS_PATH);
}

/** POST a new key; the response carries the one-time secret. */
export async function createApiKey(body: {
  name: string;
}): Promise<CreatedApiKey> {
  return apiClient.local.json<CreatedApiKey>(API_KEYS_PATH, {
    method: "POST",
    body,
  });
}

/** DELETE (revoke) a key the caller owns. */
export async function revokeApiKey(id: string): Promise<void> {
  const path = `${API_KEYS_PATH}/${encodeURIComponent(id)}`;
  await apiClient.local.json<void>(path, { method: "DELETE" });
}

/** GET the audit log; SaaS or local, backend-scoped (admin → server, SaaS lead → team). */
export async function fetchAuditLog(tier: Tier): Promise<AuditLogResponse> {
  const path = `/api/v1/proprietary/ui-data/infrastructure/audit-log${q(tier)}`;
  return apiClient.saas.isConfigured()
    ? apiClient.saas.json<AuditLogResponse>(path)
    : apiClient.local.json<AuditLogResponse>(path);
}

/** Download the audit log as a CSV/JSON blob (admin-only, whole-server); SaaS or local. */
export async function exportAuditLog(
  format: "csv" | "json",
  fields: string,
): Promise<Blob> {
  const path = `/api/v1/proprietary/ui-data/audit-export?format=${format}&fields=${encodeURIComponent(
    fields,
  )}`;
  return apiClient.saas.isConfigured()
    ? apiClient.saas.blob(path)
    : apiClient.local.blob(path);
}
