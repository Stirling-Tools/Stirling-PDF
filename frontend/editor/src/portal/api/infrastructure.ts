import { apiClient } from "@portal/api/http";
import type { Tier } from "@portal/contexts/TierContext";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Deployments                                                              */
/* ──────────────────────────────────────────────────────────────────────── */

export type RegionStatus = "healthy" | "degraded" | "down";

export interface DeploymentRegion {
  name: string;
  code: string;
  /** Median request latency, ms. */
  latencyMs: number;
  /** Current load as a fraction of provisioned capacity (0–1). */
  load: number;
  status: RegionStatus;
  /** Deployed Stirling engine version. */
  version: string;
  /** 30-day uptime as a fraction (0–1). */
  uptime: number;
  /** Running instance count. */
  instances: number;
  /** Sustained throughput, docs/min. */
  throughput: number;
  /** P99 latency, ms. */
  p99Ms: number;
}

export type DeploymentStatus = "live" | "rolling" | "rolled-back" | "queued";

export interface RecentDeployment {
  id: string;
  version: string;
  environment: "production" | "staging" | "canary";
  product: string;
  status: DeploymentStatus;
  deployedBy: string;
  timestamp: string;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  API Keys                                                                 */
/* ──────────────────────────────────────────────────────────────────────── */

export type ApiKeyStatus = "active" | "revoked" | "rotate-soon";
export type ApiKeyPermission = "Read" | "Write" | "Admin";

export interface ApiKey {
  id: string;
  name: string;
  /** Masked prefix shown in the list, e.g. "sk_live_a3f8…". */
  prefix: string;
  created: string;
  lastUsed: string;
  status: ApiKeyStatus;
  /** Requests/min ceiling. */
  rateLimit: number;
  permissions: ApiKeyPermission[];
  allowedIps: string[];
  usageToday: number;
  usageMonth: number;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Security                                                                 */
/* ──────────────────────────────────────────────────────────────────────── */

export type AccessPolicy = "stirling" | "byok" | "hyok";
export type DataResidency = "us" | "eu" | "apac";
export type CertStatus = "certified" | "in-progress" | "not-started";

export interface ComplianceCert {
  id: string;
  name: string;
  status: CertStatus;
  detail: string;
}

export interface IpAllowEntry {
  id: string;
  label: string;
  cidr: string;
  addedBy: string;
  added: string;
}

/**
 * Where encryption keys live. Mirrors the {@link AccessPolicy} posture but is
 * surfaced separately because the key *custody model* (who can decrypt) is the
 * detail security teams scrutinise:
 *   - `managed` — Stirling-owned KMS keys; zero key ops on the customer side.
 *   - `byok` — customer key, but Stirling can use it to decrypt while processing.
 *   - `hyok` — key never leaves the customer KMS; Stirling holds only ciphertext.
 */
export type KeyMode = "managed" | "byok" | "hyok";

export interface KeyManagement {
  mode: KeyMode;
  /** Human-readable provider, e.g. "Stirling KMS" or "AWS KMS (customer)". */
  provider: string;
  /** ARN-style identifier for the active key. */
  keyId: string;
  /** Encryption algorithm in force. */
  algorithm: string;
  /** Relative last-rotation time, e.g. "32 days ago". */
  lastRotated: string;
  /** Rotation cadence summary, e.g. "Automatic · every 90 days". */
  rotationPolicy: string;
  /**
   * Whether the customer may switch key custody (BYOK/HYOK). Stirling-managed
   * tiers see the posture but cannot change provider — only enterprise can.
   */
  customerManaged: boolean;
}

export type AttestationStatus = "attested" | "in-scope" | "not-applicable";

export interface ComplianceAttestation {
  id: string;
  name: string;
  /** Framework family / short descriptor shown under the name. */
  framework: string;
  status: AttestationStatus;
  /** Coverage or audit detail, e.g. "Type II · audited Apr 2026". */
  detail: string;
  /** Stub link to the downloadable report; null when none is available. */
  reportUrl: string | null;
}

export interface SecurityConfig {
  accessPolicy: AccessPolicy;
  dataResidency: DataResidency;
  certs: ComplianceCert[];
  ipAllowlist: IpAllowEntry[];
  keyManagement: KeyManagement;
  attestations: ComplianceAttestation[];
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Storage                                                                  */
/* ──────────────────────────────────────────────────────────────────────── */

export type RetentionWindow = "30" | "60" | "90" | "180" | "never";

export interface StorageProvider {
  id: string;
  name: string;
  kind: "stirling" | "s3" | "azure";
  connected: boolean;
  detail: string;
  usedGb: number;
}

export interface StorageConfig {
  /** Total used storage, GB. */
  usedGb: number;
  /** Quota ceiling, GB. */
  quotaGb: number;
  retention: RetentionWindow;
  providers: StorageProvider[];
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Audit Logs                                                               */
/* ──────────────────────────────────────────────────────────────────────── */

export type AuditCategory =
  | "auth"
  | "config"
  | "elevation"
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
/*  Models                                                                   */
/* ──────────────────────────────────────────────────────────────────────── */

export type ModelProvider = "stirling" | "openai" | "anthropic" | "on-prem";
export type ModelType = "extraction" | "classification" | "ocr" | "llm";
export type ModelStatus = "active" | "degraded" | "disabled";

/** Whether a model's cost is billed per 1k documents or per individual call. */
export type ModelCostUnit = "per-1k-docs" | "per-call";

export interface ModelEntry {
  id: string;
  name: string;
  provider: ModelProvider;
  type: ModelType;
  status: ModelStatus;
  /** Median inference latency, ms. */
  latencyMs: number;
  /** Cost in USD for the model's billing unit (see {@link costUnit}). */
  cost: number;
  costUnit: ModelCostUnit;
  version: string;
  /** Share of capacity this model is currently absorbing (0–1). */
  load: number;
  /** True for customer-registered bring-your-own / on-prem models. */
  managed: boolean;
}

/** A binding from a processing operation (optionally a doc-type) to a model. */
export interface RoutingRule {
  id: string;
  /** The operation or pipeline stage this rule governs. */
  operation: string;
  /** Doc-type scope, or "All document types" for a catch-all. */
  docType: string;
  /** id of the {@link ModelEntry} this operation routes to. */
  modelId: string;
  modelName: string;
  /** Marks the fallback rule applied when no narrower rule matches. */
  isDefault: boolean;
}

export interface ModelsSummary {
  activeModels: number;
  /** Capacity-weighted average latency across active models, ms. */
  avgLatencyMs: number;
  /** Projected monthly model spend, USD. */
  monthlySpend: number;
}

export interface ModelsResponse {
  summary: ModelsSummary;
  models: ModelEntry[];
  routing: RoutingRule[];
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Endpoints                                                                */
/* ──────────────────────────────────────────────────────────────────────── */

export interface DeploymentsResponse {
  regions: DeploymentRegion[];
  recent: RecentDeployment[];
}

const q = (tier: Tier) => `?tier=${encodeURIComponent(tier)}`;

/** GET /v1/infrastructure/deployments?tier=… */
export async function fetchDeployments(
  tier: Tier,
): Promise<DeploymentsResponse> {
  return apiClient.local.json<DeploymentsResponse>(
    `/v1/infrastructure/deployments${q(tier)}`,
  );
}

/** GET /v1/infrastructure/api-keys?tier=… */
export async function fetchApiKeys(tier: Tier): Promise<ApiKey[]> {
  return apiClient.local.json<ApiKey[]>(
    `/v1/infrastructure/api-keys${q(tier)}`,
  );
}

/** GET /v1/infrastructure/security?tier=… */
export async function fetchSecurity(tier: Tier): Promise<SecurityConfig> {
  return apiClient.local.json<SecurityConfig>(
    `/v1/infrastructure/security${q(tier)}`,
  );
}

/** GET /v1/infrastructure/models?tier=… */
export async function fetchModels(tier: Tier): Promise<ModelsResponse> {
  return apiClient.local.json<ModelsResponse>(
    `/v1/infrastructure/models${q(tier)}`,
  );
}

/** GET /v1/infrastructure/storage?tier=… */
export async function fetchStorage(tier: Tier): Promise<StorageConfig> {
  return apiClient.local.json<StorageConfig>(
    `/v1/infrastructure/storage${q(tier)}`,
  );
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
