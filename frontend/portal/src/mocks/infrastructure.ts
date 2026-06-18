/**
 * Infrastructure surface fixtures and the types api/infrastructure.ts shares
 * with them. api/infrastructure.ts imports the types; the MSW handlers in
 * mocks/handlers/ serve the fixture data over the intercepted httpJson() calls.
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

const REGION_US_EAST: DeploymentRegion = {
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
  lastUsed: string;
  status: ApiKeyStatus;
  /** Requests/min ceiling. */
  rateLimit: number;
  permissions: ApiKeyPermission[];
  allowedIps: string[];
  usageToday: number;
  usageMonth: number;
}

const API_KEYS_ALL: ApiKey[] = [
  {
    id: "key-1",
    name: "Production · ingest",
    prefix: "sk_live_a3f8…",
    created: "Mar 2, 2026",
    lastUsed: "2m ago",
    status: "active",
    rateLimit: 1200,
    permissions: ["Read", "Write"],
    allowedIps: ["52.14.0.0/16", "18.221.0.0/16"],
    usageToday: 84210,
    usageMonth: 2410933,
  },
  {
    id: "key-2",
    name: "Analytics · read-only",
    prefix: "sk_live_77be…",
    created: "Jan 18, 2026",
    lastUsed: "41m ago",
    status: "active",
    rateLimit: 300,
    permissions: ["Read"],
    allowedIps: [],
    usageToday: 6120,
    usageMonth: 188400,
  },
  {
    id: "key-3",
    name: "Ops · admin (legacy)",
    prefix: "sk_live_d901…",
    created: "Aug 9, 2025",
    lastUsed: "6d ago",
    status: "rotate-soon",
    rateLimit: 600,
    permissions: ["Read", "Write", "Admin"],
    allowedIps: ["203.0.113.7/32"],
    usageToday: 0,
    usageMonth: 14200,
  },
  {
    id: "key-4",
    name: "Sandbox · webhook tester",
    prefix: "sk_test_2c4a…",
    created: "May 30, 2026",
    lastUsed: "never",
    status: "revoked",
    rateLimit: 60,
    permissions: ["Read"],
    allowedIps: [],
    usageToday: 0,
    usageMonth: 0,
  },
];

export function apiKeysFor(tier: Tier): ApiKey[] {
  if (tier === "free") return API_KEYS_ALL.slice(0, 1);
  if (tier === "pro") return API_KEYS_ALL.slice(0, 3);
  return API_KEYS_ALL;
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

const CERTS_FULL: ComplianceCert[] = [
  {
    id: "soc2",
    name: "SOC 2 Type II",
    status: "certified",
    detail: "Audited Apr 2026 · Coalfire",
  },
  {
    id: "iso",
    name: "ISO 27001",
    status: "certified",
    detail: "Cert #IS-774201 · valid to 2027",
  },
  {
    id: "hipaa",
    name: "HIPAA",
    status: "certified",
    detail: "BAA available · PHI-eligible",
  },
  {
    id: "gdpr",
    name: "GDPR",
    status: "certified",
    detail: "EU SCCs · DPA on file",
  },
];

const CERTS_FREE: ComplianceCert[] = [
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
    id: "hipaa",
    name: "HIPAA",
    status: "not-started",
    detail: "Requires a paid plan + BAA",
  },
  {
    id: "gdpr",
    name: "GDPR",
    status: "in-progress",
    detail: "Standard EU processing terms",
  },
];

const IP_ALLOWLIST: IpAllowEntry[] = [
  {
    id: "ip-1",
    label: "Corp VPN egress",
    cidr: "52.14.0.0/16",
    addedBy: "maria.chen",
    added: "Feb 11, 2026",
  },
  {
    id: "ip-2",
    label: "Data centre — IAD",
    cidr: "18.221.0.0/16",
    addedBy: "devon.park",
    added: "Jan 4, 2026",
  },
  {
    id: "ip-3",
    label: "On-call jump host",
    cidr: "203.0.113.7/32",
    addedBy: "maria.chen",
    added: "Dec 19, 2025",
  },
];

// Stirling-managed key custody — what free/pro tiers run on. No key ops on the
// customer side, so the provider/key fields describe Stirling's own KMS.
const KEY_MANAGED: KeyManagement = {
  mode: "managed",
  provider: "Stirling KMS",
  keyId: "arn:stirling:kms:us-east-1:platform/cmk-default",
  algorithm: "AES-256-GCM",
  lastRotated: "32 days ago",
  rotationPolicy: "Automatic · every 90 days",
  customerManaged: false,
};

const KEY_HYOK: KeyManagement = {
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
    framework: "ISO/IEC 27001:2022",
    status: "attested",
    detail: "Cert #IS-774201 · valid to 2027",
    reportUrl: "/v1/infrastructure/security/reports/iso27001",
  },
  {
    id: "hipaa",
    name: "HIPAA",
    framework: "US healthcare · PHI",
    status: "attested",
    detail: "BAA signed · PHI-eligible workloads",
    reportUrl: "/v1/infrastructure/security/reports/hipaa",
  },
  {
    id: "gdpr",
    name: "GDPR",
    framework: "EU data protection",
    status: "attested",
    detail: "EU SCCs · DPA on file · EU residency",
    reportUrl: "/v1/infrastructure/security/reports/gdpr",
  },
  {
    id: "pci",
    name: "PCI DSS",
    framework: "Payment card data",
    status: "in-scope",
    detail: "SAQ-D in progress · QSA assessment Q3",
    reportUrl: null,
  },
];

// What lower tiers can claim: the platform-inherited attestations only. HIPAA
// and PCI require a paid contract + signed paperwork, so they read as
// not-applicable until the customer upgrades.
const ATTESTATIONS_FREE: ComplianceAttestation[] = [
  {
    id: "soc2",
    name: "SOC 2 Type II",
    framework: "AICPA Trust Services",
    status: "attested",
    detail: "Inherited — Stirling platform",
    reportUrl: "/v1/infrastructure/security/reports/soc2",
  },
  {
    id: "iso27001",
    name: "ISO 27001",
    framework: "ISO/IEC 27001:2022",
    status: "attested",
    detail: "Inherited — Stirling platform",
    reportUrl: "/v1/infrastructure/security/reports/iso27001",
  },
  {
    id: "gdpr",
    name: "GDPR",
    framework: "EU data protection",
    status: "in-scope",
    detail: "Standard EU processing terms",
    reportUrl: null,
  },
  {
    id: "hipaa",
    name: "HIPAA",
    framework: "US healthcare · PHI",
    status: "not-applicable",
    detail: "Requires a paid plan + signed BAA",
    reportUrl: null,
  },
  {
    id: "pci",
    name: "PCI DSS",
    framework: "Payment card data",
    status: "not-applicable",
    detail: "Requires an enterprise contract",
    reportUrl: null,
  },
];

export function securityFor(tier: Tier): SecurityConfig {
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

const AUDIT_EVENTS_ALL: AuditEvent[] = [
  {
    id: "a-1",
    timestamp: "10:42:18",
    category: "processing",
    action: "Pipeline run completed",
    actor: "ci-bot",
    target: "COI Compliance",
    status: "success",
    latencyMs: 412,
  },
  {
    id: "a-2",
    timestamp: "10:38:02",
    category: "auth",
    action: "API key authenticated",
    actor: "sk_live_a3f8…",
    target: "us-east-1 gateway",
    status: "success",
    latencyMs: 9,
  },
  {
    id: "a-3",
    timestamp: "10:31:55",
    category: "elevation",
    action: "Admin role assumed",
    actor: "maria.chen",
    target: "Security settings",
    status: "warning",
    latencyMs: 21,
  },
  {
    id: "a-4",
    timestamp: "10:24:40",
    category: "config",
    action: "Retention policy changed",
    actor: "devon.park",
    target: "30d → 90d",
    status: "info",
    latencyMs: 14,
  },
  {
    id: "a-5",
    timestamp: "10:19:07",
    category: "security",
    action: "IP allowlist updated",
    actor: "maria.chen",
    target: "203.0.113.7/32",
    status: "info",
    latencyMs: 11,
  },
  {
    id: "a-6",
    timestamp: "10:12:33",
    category: "auth",
    action: "Failed key authentication",
    actor: "sk_live_d901…",
    target: "us-west-2 gateway",
    status: "danger",
    latencyMs: 6,
  },
  {
    id: "a-7",
    timestamp: "10:04:51",
    category: "processing",
    action: "Redaction job queued",
    actor: "ci-bot",
    target: "Prior Auth batch",
    status: "success",
    latencyMs: 188,
  },
  {
    id: "a-8",
    timestamp: "09:58:12",
    category: "elevation",
    action: "Key rotation requested",
    actor: "devon.park",
    target: "Ops · admin (legacy)",
    status: "warning",
    latencyMs: 33,
  },
  {
    id: "a-9",
    timestamp: "09:51:44",
    category: "security",
    action: "Access policy set to HYOK",
    actor: "maria.chen",
    target: "Document encryption",
    status: "info",
    latencyMs: 27,
  },
  {
    id: "a-10",
    timestamp: "09:43:20",
    category: "config",
    action: "Region added",
    actor: "ci-bot",
    target: "eu-west-1",
    status: "success",
    latencyMs: 240,
  },
  {
    id: "a-11",
    timestamp: "09:36:08",
    category: "processing",
    action: "Schema drift flagged",
    actor: "extract-engine",
    target: "Invoice v3",
    status: "warning",
    latencyMs: 95,
  },
  {
    id: "a-12",
    timestamp: "09:28:55",
    category: "auth",
    action: "SSO session started",
    actor: "devon.park",
    target: "Okta · acme.com",
    status: "success",
    latencyMs: 18,
  },
];

export interface AuditSummary {
  totalEvents: number;
  processing: number;
  elevation: number;
  config: number;
}

export interface AuditLogResponse {
  summary: AuditSummary;
  events: AuditEvent[];
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

const MODELS_ALL: ModelEntry[] = [
  {
    id: "m-extract-v3",
    name: "Stirling Extract",
    provider: "stirling",
    type: "extraction",
    status: "active",
    latencyMs: 142,
    cost: 0.9,
    costUnit: "per-1k-docs",
    version: "v3.4.2",
    load: 0.71,
    managed: true,
  },
  {
    id: "m-classify-v2",
    name: "Stirling Classify",
    provider: "stirling",
    type: "classification",
    status: "active",
    latencyMs: 61,
    cost: 0.4,
    costUnit: "per-1k-docs",
    version: "v2.8.0",
    load: 0.48,
    managed: true,
  },
  {
    id: "m-ocr-tess",
    name: "Stirling OCR",
    provider: "stirling",
    type: "ocr",
    status: "active",
    latencyMs: 318,
    cost: 1.2,
    costUnit: "per-1k-docs",
    version: "v3.1.0",
    load: 0.55,
    managed: true,
  },
  {
    id: "m-gpt4o",
    name: "GPT-4o",
    provider: "openai",
    type: "llm",
    status: "active",
    latencyMs: 880,
    cost: 0.012,
    costUnit: "per-call",
    version: "2026-05",
    load: 0.33,
    managed: true,
  },
  {
    id: "m-claude-sonnet",
    name: "Claude Sonnet 4.5",
    provider: "anthropic",
    type: "llm",
    status: "degraded",
    latencyMs: 1240,
    cost: 0.009,
    costUnit: "per-call",
    version: "2026-04",
    load: 0.21,
    managed: true,
  },
  {
    id: "m-onprem-ocr",
    name: "On-prem OCR (Tesseract)",
    provider: "on-prem",
    type: "ocr",
    status: "active",
    latencyMs: 502,
    cost: 0,
    costUnit: "per-1k-docs",
    version: "byo-1.2",
    load: 0.12,
    managed: false,
  },
  // Registered but parked: a customer LLM weight kept warm without traffic.
  {
    id: "m-onprem-llm",
    name: "On-prem Llama 3 70B",
    provider: "on-prem",
    type: "llm",
    status: "disabled",
    latencyMs: 0,
    cost: 0,
    costUnit: "per-call",
    version: "byo-0.9",
    load: 0,
    managed: false,
  },
];

export function modelsFor(tier: Tier): ModelEntry[] {
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

  const monthlySpend = tier === "free" ? 0 : tier === "pro" ? 1840 : 6120;

  return {
    summary: {
      activeModels: active.length,
      avgLatencyMs,
      monthlySpend,
    },
    models,
    routing: routingFor(tier),
  };
}

export function auditLogFor(tier: Tier): AuditLogResponse {
  const events =
    tier === "free"
      ? AUDIT_EVENTS_ALL.slice(0, 5)
      : tier === "pro"
        ? AUDIT_EVENTS_ALL.slice(0, 9)
        : AUDIT_EVENTS_ALL;

  // Headline counts reflect a full 24h window, not just the visible slice —
  // the table shows the most recent events, the metrics show the day's totals.
  const scale = tier === "free" ? 1 : tier === "pro" ? 21 : 86;
  const summary: AuditSummary = {
    totalEvents: events.length * scale,
    processing:
      events.filter((e) => e.category === "processing").length * scale,
    elevation: events.filter((e) => e.category === "elevation").length * scale,
    config: events.filter((e) => e.category === "config").length * scale,
  };
  return { summary, events };
}
