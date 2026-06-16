/**
 * Sources & Agents fixtures and the types api/sources.ts shares with them.
 *
 * A "source" is anything that feeds documents into Stirling — an interactive
 * editor session, an autonomous agent, an API client, a webhook, a storage
 * connector, an email inbox, a desktop app, or a batch job. Each carries a
 * type-specific detail payload surfaced when its table row is expanded.
 *
 * api/sources.ts imports the types; the MSW handlers serve the fixture data
 * over the intercepted httpJson() calls. Components never reach into this
 * module directly. Once a real backend exists the handlers stop being
 * registered and these fixtures can be deleted (or kept as test seeds).
 */

import type { Tier } from "@portal/contexts/TierContext";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Source types                                                             */
/* ──────────────────────────────────────────────────────────────────────── */

export type SourceType =
  | "editor"
  | "agent"
  | "apiclient"
  | "webhook"
  | "connector"
  | "email"
  | "desktop"
  | "batch";

export type SourceStatus = "active" | "idle" | "degraded" | "paused" | "error";

/** Type-specific detail payloads, discriminated by `kind`. */

export interface AgentDetail {
  kind: "agent";
  model: string;
  /** Calls over the trailing 24h. */
  calls24h: number;
  errorRate: number;
  /** Mean output confidence 0..1. */
  confidence: number;
  escalations24h: number;
  /** Pipelines this agent is allowed to invoke. */
  assignedPipelines: string[];
  scopes: string[];
}

export interface ApiClientDetail {
  kind: "apiclient";
  /** Pre-masked for display — never carries the real secret. */
  maskedKey: string;
  rateLimit: string;
  /** Requests used against the current rate-limit window. */
  rateUsedPct: number;
  endpoints: { method: string; path: string; calls24h: number }[];
  createdBy: string;
  lastRotated: string;
}

export interface WebhookDetail {
  kind: "webhook";
  url: string;
  authType: "HMAC-SHA256" | "Bearer token" | "Basic" | "None";
  successRate: number;
  /** Recent deliveries, newest first. */
  recentDeliveries: { event: string; status: number; time: string }[];
  retries24h: number;
}

/** Generic key/value detail for the simpler source types. */
export interface BasicDetail {
  kind: "basic";
  rows: { label: string; value: string }[];
}

export type SourceDetail =
  | AgentDetail
  | ApiClientDetail
  | WebhookDetail
  | BasicDetail;

export interface Source {
  id: string;
  name: string;
  type: SourceType;
  status: SourceStatus;
  docs24h: number;
  docs30d: number;
  /** Relative-time string, e.g. "2m ago". */
  lastEvent: string;
  owner: string;
  detail: SourceDetail;
}

export interface SourcesKpi {
  value: string | number;
  delta?: number;
  deltaDirection?: "up" | "down" | "flat";
  description?: string;
}

export interface SourcesResponse {
  kpis: SourcesKpi[];
  sources: Source[];
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Per-type presentation metadata (icon + chip tone + label)               */
/*  Lives client-side — it's product copy, not data. Re-exported for the     */
/*  view via api/sources.ts.                                                 */
/* ──────────────────────────────────────────────────────────────────────── */

export interface SourceTypeMeta {
  label: string;
  icon: string;
  tone: "neutral" | "blue" | "purple" | "green" | "amber" | "red";
}

export const SOURCE_TYPE_META: Record<SourceType, SourceTypeMeta> = {
  editor: { label: "Editor", icon: "✎", tone: "neutral" },
  agent: { label: "Agent", icon: "◆", tone: "purple" },
  apiclient: { label: "API client", icon: "⌘", tone: "blue" },
  webhook: { label: "Webhook", icon: "⇄", tone: "green" },
  connector: { label: "Connector", icon: "⛁", tone: "amber" },
  email: { label: "Email inbox", icon: "✉", tone: "blue" },
  desktop: { label: "Desktop", icon: "▣", tone: "neutral" },
  batch: { label: "Batch job", icon: "≡", tone: "amber" },
};

export const SOURCE_STATUS_TONE: Record<
  SourceStatus,
  "success" | "warning" | "danger" | "neutral" | "info"
> = {
  active: "success",
  idle: "neutral",
  degraded: "warning",
  paused: "info",
  error: "danger",
};

/* ──────────────────────────────────────────────────────────────────────── */
/*  Fixture builders                                                         */
/* ──────────────────────────────────────────────────────────────────────── */

function agentDetail(over: Partial<AgentDetail>): AgentDetail {
  return {
    kind: "agent",
    model: "claude-sonnet-4.5",
    calls24h: 0,
    errorRate: 0,
    confidence: 0.95,
    escalations24h: 0,
    assignedPipelines: [],
    scopes: [],
    ...over,
  };
}

const PRO_SOURCES: Source[] = [
  {
    id: "src-editor-1",
    name: "Web Editor — workspace",
    type: "editor",
    status: "active",
    docs24h: 38,
    docs30d: 642,
    lastEvent: "4m ago",
    owner: "you@acme.com",
    detail: {
      kind: "basic",
      rows: [
        { label: "Session", value: "Browser · Chrome 126" },
        { label: "Active editors", value: "3 this week" },
        { label: "Default pipeline", value: "Redact & Flatten" },
        { label: "Region", value: "us-east-1" },
      ],
    },
  },
  {
    id: "src-agent-1",
    name: "Invoice Extractor",
    type: "agent",
    status: "active",
    docs24h: 1287,
    docs30d: 31840,
    lastEvent: "32s ago",
    owner: "platform@acme.com",
    detail: agentDetail({
      model: "claude-sonnet-4.5",
      calls24h: 1342,
      errorRate: 0.004,
      confidence: 0.962,
      escalations24h: 11,
      assignedPipelines: ["Invoice v3", "AP Routing"],
      scopes: ["documents:read", "pipelines:invoke", "extract:write"],
    }),
  },
  {
    id: "src-agent-2",
    name: "Contract Router",
    type: "agent",
    status: "degraded",
    docs24h: 412,
    docs30d: 9870,
    lastEvent: "6m ago",
    owner: "legal-ops@acme.com",
    // Degraded: error rate over the 5% alarm threshold and confidence below the
    // green band, so the panel renders danger/amber tones.
    detail: agentDetail({
      model: "claude-opus-4.1",
      calls24h: 455,
      errorRate: 0.071,
      confidence: 0.883,
      escalations24h: 34,
      assignedPipelines: ["Contract Review", "DPA Classifier"],
      scopes: ["documents:read", "pipelines:invoke", "review:escalate"],
    }),
  },
  {
    id: "src-agent-3",
    name: "KYC Processor",
    type: "agent",
    status: "active",
    docs24h: 768,
    docs30d: 18420,
    lastEvent: "1m ago",
    owner: "risk@acme.com",
    detail: agentDetail({
      model: "claude-sonnet-4.5",
      calls24h: 802,
      errorRate: 0.012,
      confidence: 0.941,
      escalations24h: 7,
      assignedPipelines: ["KYC Onboarding"],
      scopes: ["documents:read", "pipelines:invoke", "pii:read"],
    }),
  },
  {
    id: "src-api-1",
    name: "Acme Production",
    type: "apiclient",
    status: "active",
    docs24h: 2940,
    docs30d: 71200,
    lastEvent: "11s ago",
    owner: "platform@acme.com",
    detail: {
      kind: "apiclient",
      maskedKey: "sk_live_••••••••••••4f9a",
      rateLimit: "600 req/min",
      rateUsedPct: 0.42,
      endpoints: [
        { method: "POST", path: "/v1/extract", calls24h: 1820 },
        { method: "POST", path: "/v1/redact", calls24h: 740 },
        { method: "GET", path: "/v1/documents/{id}", calls24h: 380 },
      ],
      createdBy: "you@acme.com",
      lastRotated: "23 days ago",
    },
  },
  {
    id: "src-webhook-1",
    name: "Slack delivery hook",
    type: "webhook",
    status: "active",
    docs24h: 96,
    docs30d: 2310,
    lastEvent: "9m ago",
    owner: "platform@acme.com",
    detail: {
      kind: "webhook",
      url: "https://hooks.acme.com/stirling/ingest",
      authType: "HMAC-SHA256",
      successRate: 0.991,
      retries24h: 3,
      recentDeliveries: [
        { event: "document.processed", status: 200, time: "9m ago" },
        { event: "pipeline.completed", status: 200, time: "22m ago" },
        { event: "document.processed", status: 503, time: "1h ago" },
      ],
    },
  },
  {
    id: "src-webhook-err",
    name: "Legacy ERP callback",
    type: "webhook",
    status: "error",
    docs24h: 41,
    docs30d: 1180,
    lastEvent: "2m ago",
    owner: "integrations@acme.com",
    // Endpoint is rejecting most deliveries — success rate below the 95% floor
    // drives the danger tone and the retry count climbs.
    detail: {
      kind: "webhook",
      url: "https://erp.acme.com/inbound/stirling",
      authType: "Basic",
      successRate: 0.72,
      retries24h: 58,
      recentDeliveries: [
        { event: "document.processed", status: 502, time: "2m ago" },
        { event: "document.processed", status: 502, time: "5m ago" },
        { event: "pipeline.completed", status: 200, time: "9m ago" },
      ],
    },
  },
  {
    id: "src-batch-1",
    name: "Nightly archive reprocess",
    type: "batch",
    status: "idle",
    docs24h: 0,
    docs30d: 48600,
    lastEvent: "8h ago",
    owner: "data-eng@acme.com",
    detail: {
      kind: "basic",
      rows: [
        { label: "Schedule", value: "Daily · 02:00 UTC" },
        { label: "Last run", value: "1,620 docs · 0 errors" },
        { label: "Source bucket", value: "s3://acme-archive/inbound" },
        { label: "Pipeline", value: "OCR & Index" },
      ],
    },
  },
];

const ENTERPRISE_EXTRA: Source[] = [
  {
    id: "src-connector-1",
    name: "SharePoint — Legal",
    type: "connector",
    status: "active",
    docs24h: 1840,
    docs30d: 44900,
    lastEvent: "2m ago",
    owner: "legal-ops@acme.com",
    detail: {
      kind: "basic",
      rows: [
        { label: "Provider", value: "Microsoft SharePoint" },
        { label: "Sync", value: "Delta · every 5 min" },
        { label: "Watched library", value: "Contracts / Inbound" },
        { label: "Auth", value: "Azure AD app registration" },
      ],
    },
  },
  {
    id: "src-connector-2",
    name: "S3 — claims-intake",
    type: "connector",
    status: "active",
    docs24h: 5210,
    docs30d: 128400,
    lastEvent: "40s ago",
    owner: "claims@acme.com",
    detail: {
      kind: "basic",
      rows: [
        { label: "Provider", value: "AWS S3" },
        { label: "Bucket", value: "s3://acme-claims/intake" },
        { label: "Notification", value: "EventBridge → SQS" },
        { label: "Region", value: "us-east-1" },
      ],
    },
  },
  {
    id: "src-email-1",
    name: "invoices@acme.com",
    type: "email",
    status: "active",
    docs24h: 318,
    docs30d: 7640,
    lastEvent: "14m ago",
    owner: "ap@acme.com",
    detail: {
      kind: "basic",
      rows: [
        { label: "Inbox", value: "invoices@acme.com" },
        { label: "Attachments", value: "PDF only · max 25 MB" },
        { label: "Pipeline", value: "Invoice v3" },
        { label: "Spam filter", value: "Enabled · DKIM verified" },
      ],
    },
  },
  {
    id: "src-desktop-1",
    name: "Stirling Desktop — Reviewer pool",
    type: "desktop",
    status: "idle",
    docs24h: 47,
    docs30d: 1290,
    lastEvent: "3h ago",
    owner: "review-team@acme.com",
    detail: {
      kind: "basic",
      rows: [
        { label: "App version", value: "Desktop 2.7.1" },
        { label: "Seats", value: "12 active devices" },
        { label: "Default pipeline", value: "Manual Review" },
        { label: "Offline queue", value: "Enabled" },
      ],
    },
  },
  {
    id: "src-agent-4",
    name: "Compliance Sweep",
    type: "agent",
    status: "active",
    docs24h: 2105,
    docs30d: 52300,
    lastEvent: "18s ago",
    owner: "compliance@acme.com",
    detail: agentDetail({
      model: "claude-opus-4.1",
      calls24h: 2180,
      errorRate: 0.008,
      confidence: 0.957,
      escalations24h: 19,
      assignedPipelines: ["COI Compliance", "PII Sweep", "Retention Policy"],
      scopes: ["documents:read", "pipelines:invoke", "pii:read", "audit:write"],
    }),
  },
  {
    id: "src-webhook-2",
    name: "Datadog events hook",
    type: "webhook",
    status: "active",
    docs24h: 410,
    docs30d: 9800,
    lastEvent: "1m ago",
    owner: "sre@acme.com",
    detail: {
      kind: "webhook",
      url: "https://intake.datadoghq.com/stirling/events",
      authType: "Bearer token",
      successRate: 0.999,
      retries24h: 0,
      recentDeliveries: [
        { event: "pipeline.completed", status: 202, time: "1m ago" },
        { event: "agent.escalated", status: 202, time: "12m ago" },
        { event: "pipeline.failed", status: 202, time: "47m ago" },
      ],
    },
  },
  {
    id: "src-api-revoked",
    name: "Legacy ETL (revoked)",
    type: "apiclient",
    status: "error",
    docs24h: 0,
    docs30d: 3120,
    lastEvent: "5d ago",
    owner: "data-eng@acme.com",
    // Key was revoked after a leak; calls now 401 so 24h traffic is zero while
    // the 30d window still shows the pre-revocation volume.
    detail: {
      kind: "apiclient",
      maskedKey: "sk_live_••••••••••••0000 (revoked)",
      rateLimit: "300 req/min",
      rateUsedPct: 0,
      endpoints: [
        { method: "POST", path: "/v1/extract", calls24h: 0 },
        { method: "POST", path: "/v1/redact", calls24h: 0 },
      ],
      createdBy: "former-admin@acme.com",
      lastRotated: "never",
    },
  },
  {
    id: "src-api-2",
    name: "Partner Integration (read-only)",
    type: "apiclient",
    status: "paused",
    docs24h: 0,
    docs30d: 14200,
    lastEvent: "2d ago",
    owner: "partnerships@acme.com",
    detail: {
      kind: "apiclient",
      maskedKey: "sk_live_••••••••••••91c2",
      rateLimit: "120 req/min",
      rateUsedPct: 0,
      endpoints: [
        { method: "GET", path: "/v1/documents/{id}", calls24h: 0 },
        { method: "GET", path: "/v1/pipelines", calls24h: 0 },
      ],
      createdBy: "you@acme.com",
      lastRotated: "61 days ago",
    },
  },
];

/** Sources for a given tier. Free is intentionally empty. */
export function sourcesFor(tier: Tier): Source[] {
  if (tier === "free") return [];
  if (tier === "enterprise") return [...PRO_SOURCES, ...ENTERPRISE_EXTRA];
  return PRO_SOURCES;
}

/**
 * KPI strip values. Pro sits below the eval pass-rate target, enterprise above —
 * the delta/direction differences let a dev see tier variation at a glance.
 */
export function kpisFor(tier: Tier): SourcesKpi[] {
  if (tier === "free") {
    return [
      { value: 0, description: "Connect a source to begin" },
      { value: 0 },
      { value: "—" },
      { value: 0 },
    ];
  }

  const sources = sourcesFor(tier);
  const agents = sources.filter((s) => s.type === "agent");
  const agentsActive = agents.filter((s) => s.status === "active").length;
  const docs24h = sources.reduce((sum, s) => sum + s.docs24h, 0);

  if (tier === "enterprise") {
    return [
      { value: agentsActive, delta: 0.25, description: `${agents.length} total` },
      { value: 42, delta: 0.09, description: "Eval scenarios" },
      { value: "96.4%", deltaDirection: "up", delta: 0.012 },
      { value: docs24h.toLocaleString(), delta: 0.14 },
    ];
  }

  // pro
  return [
    { value: agentsActive, delta: 0.5, description: `${agents.length} total` },
    { value: 18, delta: 0.2, description: "Eval scenarios" },
    { value: "91.2%", deltaDirection: "flat", delta: 0 },
    { value: docs24h.toLocaleString(), delta: 0.16 },
  ];
}

export function buildSourcesResponse(tier: Tier): SourcesResponse {
  return { kpis: kpisFor(tier), sources: sourcesFor(tier) };
}
