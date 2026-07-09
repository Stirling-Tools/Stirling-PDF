/**
 * Infrastructure surface fixtures and the types api/infrastructure.ts shares
 * with them. api/infrastructure.ts imports the types; the MSW handlers in
 * mocks/handlers/ serve the fixture data over the intercepted apiClient.local.json() calls.
 * Components never reach into this module directly.
 *
 * Everything here is tier-scaled deterministically: free sees a single region
 * and a trimmed slice of every list, pro adds a second region and the IP
 * allowlist, enterprise unlocks the full topology + compliance posture.
 *
 * Once a real backend exists the MSW handlers stop being registered and these
 * fixtures can be deleted (or kept as test seeds).
 */

import type { Tier } from "@portal/contexts/TierContext";
import type {
  AccessPolicy,
  ApiKey,
  ApiKeyPermission,
  ApiKeyStatus,
  AttestationStatus,
  AuditCategory,
  AuditEvent,
  AuditLogResponse,
  AuditStatus,
  AuditSummary,
  CertStatus,
  ComplianceAttestation,
  ComplianceCert,
  DataResidency,
  DeploymentRegion,
  DeploymentStatus,
  IpAllowEntry,
  KeyManagement,
  KeyMode,
  ModelCostUnit,
  ModelEntry,
  ModelProvider,
  ModelStatus,
  ModelType,
  ModelsResponse,
  ModelsSummary,
  RecentDeployment,
  RetentionWindow,
  RoutingRule,
  SecurityConfig,
  StorageConfig,
  StorageProvider,
} from "@portal/api/infrastructure";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Deployments                                                              */
/* ──────────────────────────────────────────────────────────────────────── */

export type DeploymentStatus = "live" | "rolling" | "rolled-bconst REGION_US_EAST: DeploymentRegion = {
  name: "US East (N. Virginia)",
  code: "us-east-1",
  latencyMs: 41,
  load: 0.62,
  status: "healthy",
  version: "v3.4.2",
  uptime: 0.99987,
  instances: 18,
  throughput: 2140,
  p99Ms: 287,
};

const REGION_US_WEST: DeploymentRegion = {
  name: "US West (Oregon)",
  code: "us-west-2",
  latencyMs: 53,
  load: 0.74,
  status: "healthy",
  version: "v3.4.2",
  uptime: 0.99971,
  instances: 12,
  throughput: 1480,
  p99Ms: 331,
};

const REGION_EU_WEST: DeploymentRegion = {
  name: "EU West (Ireland)",
  code: "eu-west-1",
  latencyMs: 68,
  load: 0.83,
  status: "degraded",
  version: "v3.4.1",
  uptime: 0.99924,
  instances: 9,
  throughput: 1120,
  p99Ms: 521,
};

// A region mid-incident: zero healthy instances, traffic drained away.
const REGION_AP_SOUTHEAST: DeploymentRegion = {
  name: "Asia Pacific (Singapore)",
  code: "ap-southeast-1",
  latencyMs: 0,
  load: 0,
  status: "down",
  version: "v3.4.1",
  uptime: 0.98612,
  instances: 0,
  throughput: 0,
  p99Ms: 0,
};

export function regionsFor(tier: Tier): DeploymentRegion[] {
  if (tier === "free") return [REGION_US_EAST];
  if (tier === "pro") return [REGION_US_EAST, REGION_US_WEST];
  return [REGION_US_EAST, REGION_US_WEST, REGION_EU_WEST, REGION_AP_SOUTHEAST];
}

const RECENT_DEPLOYMENTS_ALL: RecentDeployment[] = [
  {
    id: "dep-1",
    version: "v3.4.2",
    environment: "production",
    product: "Extraction engine",
    status: "live",
    deployedBy: "ci-bot",
    timestamp: "8m ago",
  },
  {
    id: "dep-2",
    version: "v3.4.2-rc4",
    environment: "canary",
    product: "Redaction service",
    status: "rolling",
    deployedBy: "maria.chen",
    timestamp: "34m ago",
  },
  {
    id: "dep-3",
    version: "v2.9.0",
    environment: "production",
    product: "API gateway",
    status: "live",
    deployedBy: "ci-bot",
    timestamp: "2h ago",
  },
  {
    id: "dep-4",
    version: "v3.4.1",
    environment: "staging",
    product: "OCR worker pool",
    status: "queued",
    deployedBy: "devon.park",
    timestamp: "3h ago",
  },
  {
    id: "dep-5",
    version: "v3.3.9",
    environment: "production",
    product: "Extraction engine",
    status: "rolled-back",
    deployedBy: "maria.chen",
    timestamp: "yesterday",
  },
  {
    id: "dep-6",
    version: "v3.3.8",
    environment: "production",
    product: "Webhook dispatcher",
    status: "live",
    deployedBy: "ci-bot",
    timestamp: "2d ago",
  },
];

export function recentDeploymentsFor(tier: Tier): RecentDeployment[] {
  if (tier === "free") return RECENT_DEPLOYMENTS_ALL.slice(0, 2);
  if (tier === "pro") return RECENT_DEPLOYMENTS_ALL.slice(0, 4);
  return RECENT_DEPLOYMENTS_ALL;
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
  lastUsed:const API_KEYS_ALL: ApiKey[] = [
  {
    id: "key-1",
    name: "export function apiKeysFor(tier: Tier): ApiKey[] {
  if (tier === "free") return API_KEYS_ALL.slice(0, 1);
  if (tier === "pro") return API_KEYS_ALL.slice(0, 3);
  return API_KEYS_ALL;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Security        /* ──────────────────────────────────────────────────────────────────────── */

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
 *   - `byok` — customer key, but Stirling can use it to decrypt while proceexport type KeyMode = "managed" | "byok" | "hyok";

export interface KeyManagement {
  mode: KeyMode;
  /**export type AttestationStatus = "attested" | "in-scope" | "not-applicable";

expexport interface SecurityConfig {
  accessPolicy: AccessPconst CERTS_FULL: ComplianceCert[] = [
  {
    id:const CERTS_FREE: ComplianceCert[] = [
  {
    id: "soc2",
    name: "SOC 2 Type II",
    status: "certified",
    detail: "Inherited — Stirling platform",
  },
  {
    id: "iso",
    name: "ISO 27001",
    status: "certified",
    detail: "Inherited — Stirling platform",
  },
  {
    id: "hipaaconst KEY_MANAGED: KeyManagement = {
  mode: "managed",
  provider: "Stirling KMS",
  keyId: "arn:stirling:kms:us-east-1:platform/cmk-deconst KEY_HYOK: KeyManagement = {
  mode: "hyok",
  provider: "AWS CloudHSM (customer)",
  keyId: "arn:aws:kms:eu-west-1:418xxxx:key/2a7e-hyok",
  algorithm: "AES-256-GCM · external key store",
  lastRotated: "5 days ago",
  rotationPolicy: "Customer-controlled · keys never leave your HSM",
  customerManaged: true,
};

// Full attestation set an enterprise contract is covered by.
const ATTESTATIONS_FULL: ComplianceAttestation[] = [
  {
    id: "soc2",
    name: "SOC 2 Type II",
    framework: "AICPA Trust Services",
    status: "attested",
    detail: "Type II · audited Apr 2026 · Coalfire",
    reportUrl: "/v1/infrastructure/security/reports/soc2",
  },
  {
    id: "iso27001",
    name: "ISO 27001",
    framework: "ISO/IEexport function securityFor(tier: Tier): SecurityConfig {
  if (tier === "free") {
    return {
      accessPolicy: "stirling",
      dataResidency: "us",
      certs: CERTS_FREE,
      ipAllowlist: [],
      keyManagement: KEY_MANAGED,
      attestations: ATTESTATIONS_FREE,
    };
  }
  if (tier === "pro") {
    return {
      accessPolicy: "byok",
      dataResidency: "us",
      certs: CERTS_FULL,
      ipAllowlist: IP_ALLOWLIST.slice(0, 2),
      // Pro stays on Stirling-managed keys; BYOK/HYOK is an enterprise lever.
      keyManagement: KEY_MANAGED,
      attestations: ATTESTATIONS_FREE,
    };
  }
  return {
    accessPolicy: "hyok",
    dataResidency: "eu",
    certs: CERTS_FULL,
    ipAllowlist: IP_ALLOWLIST,
    keyManagement: KEY_HYOK,
    attestations: ATTESTATIONS_FULL,
  };
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

const PROVIDERS_FULL: StorageProvider[] = [
  {
    id: "stirling",
    name: "Stirling Cloud",
    kind: "stirling",
    connected: true,
    detail: "Primary vault · us-east-1",
    usedGb: 612,
  },
  {
    id: "s3",
    name: "Amazon S3",
    kind: "s3",
    connected: true,
    detail: "s3://acme-prod-archive · WORM",
    usedGb: 388,
  },
  {
    id: "azure",
    name: "Azure Blob",
    kind: "azure",
    connected: false,
    detail: "Not connected",
    usedGb: 0,
  },
];

export function storageFor(tier: Tier): StorageConfig {
  if (tier === "free") {
    return {
      usedGb: 4.2,
      quotaGb: 5,
      retention: "30",
      providers: [PROVIDERS_FULL[0]],
    };
  }
  if (tier === "pro") {
    return {
      usedGb: 318,
      quotaGb: 500,
      retention: "90",
      providers: [PROVIDERS_FULL[0], PROVIDERS_FULL[1]],
    };
  }
  return {
    usedGb: 1000,
    quotaGb: 2000,
    retention: "180",
    providers: PROVIDERS_FULL,
  };
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

// Mirrors what the real backend (PortalInfraAuditService) returns: audit_events
// mapped from real AuditEventType values to the tab's categories. Only real
// types appear - there is no audited "elevation" event, so that category is
// absent (its summary metric reads 0), matching the backend.
const AUDIT_EVENTS_ALL: AuditEvent[] = [
  {
    id: "8841",
    timestamp: "2026-07-07 18:59:31",
    category: "processing",
    action: "Compress PDF",
    actor: "alice.chen@acme.com",
    target: "acme-invoice-8841.pdf",
    status: "success",
    latencyMs: 842,
  },
  {
    id: "8840",
    timestamp: "2026-07-07 18:40:50",
    category: "auth",
    acexport interface AuditLogResponse {
  summary: AuditSummary;
  events: AuditEvent[];
  /** True for the whole-server (admin) view; gates the admin-only CSV export./* ──────────────────────────────────────────────────────────────────────── */

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
  /** Doc-type scopeexport interface ModelsSummary {
  activeModels: number;
  /** Capacity-weighted average latency acrosexport interface ModelsResponse {
  summary: ModelsSummary;
  models: ModelEntry[];
  routing: RoutingRule[];
}

const MODELS_ALL: ModelEntry[] = [
  {
    id: "m-extract-v3",
    name: "Stirling Extract",
    provider: "stirling",
    type: "extraction",
    status: "active",
    latencyMs: 142,
    cost: 0export function modelsFor(tier: Tier): ModelEntry[] {
  // Free sees only the two managed Stirling models it can actually use.
  if (tier === "free")
    return MODELS_ALL.filter(
      (m) => m.id === "m-extract-v3" || m.id === "m-classify-v2",
    );
  // Pro gets the full managed catalogue but no bring-your-own / on-prem models.
  if (tier === "pro") return MODELS_ALL.filter((m) => m.managed);
  return MODELS_ALL;
}

const ROUTING_ALL: RoutingRule[] = [
  {
    id: "r-extract",
    operation: "Field extraction",
    docType: "Invoices",
    modelId: "m-extract-v3",
    modelName: "Stirling Extract",
    isDefault: false,
  },
  {
    id: "r-classify",
    operation: "Document classification",
    docType: "All document types",
    modelId: "m-classify-v2",
    modelName: "Stirling Classify",
    isDefault: false,
  },
  {
    id: "r-ocr",
    operation: "Text recognition",
    docType: "Scanned PDFs",
    modelId: "m-ocr-tess",
    modelName: "Stirling OCR",
    isDefault: false,
  },
  {
    id: "r-summarize",
    operation: "Summarisation",
    docType: "Contracts",
    modelId: "m-gpt4o",
    modelName: "GPT-4o",
    isDefault: false,
  },
  // Catch-all: any operation without a narrower rule falls back here.
  {
    id: "r-default",
    operation: "Default",
    docType: "All document types",
    modelId: "m-extract-v3",
    modelName: "Stirling Extract",
    isDefault: true,
  },
];

export function routingFor(tier: Tier): RoutingRule[] {
  // Free has no routing control — the table is locked behind an upgrade nudge,
  // so there are no rules to surface.
  if (tier === "free") return [];
  if (tier === "pro") return ROUTING_ALL.filter((r) => r.modelId !== "m-gpt4o");
  return ROUTING_ALL;
}

export function modelsResponseFor(tier: Tier): ModelsResponse {
  const models = modelsFor(tier);
  const active = models.filter((m) => m.status === "active");

  // Average latency is capacity-weighted so a barely-used model doesn't skew
  // the headline; falls back to a plain mean when nothing is taking load.
  const totalLoad = active.reduce((sum, m) => sum + m.load, 0);
  const avgLatencyMs =
    totalLoad > 0
      ? Math.round(
          active.reduce((sum, m) => sum + m.latencyMs * m.load, 0) / totalLoad,
        )
      : active.length > 0
        ? Math.round(
            active.reduce((sum, m) => sum + m.latencyMs, 0) / active.length,
          )
        : 0;

  const monthlySpend = tier === "free" ? 0 : tier === "pro" ? 1840 : 6120export function auditLogFor(tier: Tier): AuditLogResponse {
  const events =
    tier === "free"
      ? AUDIT_EVENTS_A