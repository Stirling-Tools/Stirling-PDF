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
  ApiKey,
  ApiKeysResponse,
  AuditEvent,
  AuditLogResponse,
  AuditSummary,
  ComplianceAttestation,
  ComplianceCert,
  DeploymentRegion,
  IpAllowEntry,
  KeyManagement,
  ModelEntry,
  ModelsResponse,
  RecentDeployment,
  RoutingRule,
  SecurityConfig,
  StorageConfig,
  StorageProvider,
} from "@portal/api/infrastructure";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Deployments                                                              */
/* ──────────────────────────────────────────────────────────────────────── */

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

const API_KEYS_ALL: ApiKey[] = [
  {
    id: "key-1",
    name: "Production · ingest",
    prefix: "sk_a3f81b2c",
    scope: "personal",
    teamName: null,
    created: "2026-03-02",
    lastUsed: "2026-07-10 09:14",
    status: "active",
    usageToday: 84210,
    usageMonth: 2410933,
    canManage: true,
  },
  {
    id: "key-2",
    name: "Team · shared ingest",
    prefix: "sk_77be0f42",
    scope: "team-members",
    teamName: "Acme Corp",
    created: "2026-01-18",
    lastUsed: "2026-07-10 08:33",
    status: "active",
    usageToday: 6120,
    usageMonth: 188400,
    canManage: true,
  },
  {
    id: "key-3",
    name: "Ops · leaders only",
    prefix: "sk_d9013ab7",
    scope: "team-lead",
    teamName: "Acme Corp",
    created: "2025-08-09",
    lastUsed: "2026-07-04 17:02",
    status: "active",
    usageToday: 0,
    usageMonth: 14200,
    canManage: true,
  },
  {
    id: "key-4",
    name: "Sandbox · webhook tester",
    prefix: "sk_2c4a91de",
    scope: "personal",
    teamName: null,
    created: "2026-05-30",
    lastUsed: "Never",
    status: "revoked",
    usageToday: 0,
    usageMonth: 0,
    canManage: true,
  },
];

export function apiKeysFor(tier: Tier): ApiKeysResponse {
  const keys =
    tier === "free"
      ? API_KEYS_ALL.slice(0, 1)
      : tier === "pro"
        ? API_KEYS_ALL.slice(0, 3)
        : API_KEYS_ALL;
  return { keys, canCreateTeamKeys: tier !== "free", teamName: "Acme Corp" };
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Security                                                                 */
/* ──────────────────────────────────────────────────────────────────────── */

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
    action: "User signed in",
    actor: "carol.diaz@acme.com",
    target: "Web session",
    status: "success",
    latencyMs: 128,
  },
  {
    id: "8839",
    timestamp: "2026-07-07 18:22:07",
    category: "security",
    action: "Add password",
    actor: "bob.martin@acme.com",
    target: "MSA-Globex-2026.pdf",
    status: "success",
    latencyMs: 1203,
  },
  {
    id: "8838",
    timestamp: "2026-07-07 17:58:44",
    category: "config",
    action: "Admin settings changed",
    actor: "admin@stirlingpdf.com",
    target: "/api/v1/admin/settings/update",
    status: "info",
    latencyMs: 210,
  },
  {
    id: "8837",
    timestamp: "2026-07-07 17:31:12",
    category: "processing",
    action: "Merge PDFs",
    actor: "raj.patel@acme.com",
    target: "onboarding-packet.pdf",
    status: "success",
    latencyMs: 2199,
  },
  {
    id: "8836",
    timestamp: "2026-07-07 17:04:55",
    category: "auth",
    action: "Failed sign-in attempt",
    actor: "bob.martn@acme.com",
    target: "Web session",
    status: "danger",
    latencyMs: 96,
  },
  {
    id: "8835",
    timestamp: "2026-07-07 16:47:29",
    category: "processing",
    action: "OCR PDF",
    actor: "api-service@acme.com",
    target: "scan-batch-0142.pdf",
    status: "success",
    latencyMs: 8421,
  },
  {
    id: "8834",
    timestamp: "2026-07-07 16:20:03",
    category: "security",
    action: "Add watermark",
    actor: "carol.diaz@acme.com",
    target: "policy-handbook.pdf",
    status: "success",
    latencyMs: 640,
  },
  {
    id: "8833",
    timestamp: "2026-07-07 15:58:41",
    category: "config",
    action: "Profile settings updated",
    actor: "alice.chen@acme.com",
    target: "/api/v1/user/change-settings",
    status: "info",
    latencyMs: 175,
  },
  {
    id: "8832",
    timestamp: "2026-07-07 15:29:18",
    category: "processing",
    action: "Split pages",
    actor: "bob.martin@acme.com",
    target: "statement-june.pdf",
    status: "success",
    latencyMs: 410,
  },
  {
    id: "8831",
    timestamp: "2026-07-07 15:02:37",
    category: "processing",
    action: "Compress PDF",
    actor: "api-service@acme.com",
    target: "purchase-order-6610.pdf",
    status: "danger",
    latencyMs: 1203,
  },
  {
    id: "8830",
    timestamp: "2026-07-07 14:41:50",
    category: "security",
    action: "Remove password",
    actor: "raj.patel@acme.com",
    target: "certificate-9001.pdf",
    status: "success",
    latencyMs: 980,
  },
  {
    id: "8829",
    timestamp: "2026-07-07 14:15:22",
    category: "processing",
    action: "PDF to Image",
    actor: "carol.diaz@acme.com",
    target: "contract-amendment.pdf",
    status: "warning",
    latencyMs: 1560,
  },
  {
    id: "8828",
    timestamp: "2026-07-07 13:52:09",
    category: "auth",
    action: "User signed out",
    actor: "alice.chen@acme.com",
    target: "Web session",
    status: "success",
    latencyMs: 42,
  },
  {
    id: "8827",
    timestamp: "2026-07-07 13:30:44",
    category: "config",
    action: "Admin settings changed",
    actor: "admin@stirlingpdf.com",
    target: "/api/v1/admin/team/update",
    status: "info",
    latencyMs: 320,
  },
  {
    id: "8826",
    timestamp: "2026-07-07 13:03:58",
    category: "processing",
    action: "Extract images",
    actor: "raj.patel@acme.com",
    target: "expense-report-q2.pdf",
    status: "success",
    latencyMs: 2200,
  },
  {
    id: "8825",
    timestamp: "2026-07-07 12:38:11",
    category: "auth",
    action: "User signed in",
    actor: "bob.martin@acme.com",
    target: "Web session",
    status: "success",
    latencyMs: 110,
  },
  {
    id: "8824",
    timestamp: "2026-07-07 12:11:47",
    category: "security",
    action: "Add watermark",
    actor: "alice.chen@acme.com",
    target: "MSA-Globex-2026.pdf",
    status: "success",
    latencyMs: 705,
  },
];

/* ──────────────────────────────────────────────────────────────────────── */
/*  Models                                                                   */
/* ──────────────────────────────────────────────────────────────────────── */

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
      ? AUDIT_EVENTS_ALL.slice(0, 6)
      : tier === "pro"
        ? AUDIT_EVENTS_ALL.slice(0, 12)
        : AUDIT_EVENTS_ALL;

  // Summary is derived from the returned events, exactly like the backend
  // (PortalInfraAuditService) computes it - so mocks and real data reconcile.
  const summary: AuditSummary = {
    totalEvents: events.length,
    processing: events.filter((e) => e.category === "processing").length,
    elevation: events.filter((e) => e.category === "elevation").length,
    config: events.filter((e) => e.category === "config").length,
  };
  // The mock represents the admin (whole-server) view, so export is offered.
  return { summary, events, fullServer: true };
}
