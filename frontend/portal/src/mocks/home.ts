/**
 * Home dashboard fixtures and the types api/home.ts shares with them.
 * api/home.ts imports the types; the MSW handlers in mocks/handlers/ serve the
 * fixture data over the intercepted httpJson() calls. Components never reach
 * into this module directly.
 *
 * Once a real backend exists, the MSW handlers stop being registered and these
 * fixtures can be deleted (or kept as test seeds).
 */

export interface UsagePoint {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** Docs processed on that day. */
  value: number;
}

/**
 * Server response for the usage-series endpoint. Returning the prior window's
 * total alongside the points lets the client derive the headline delta
 * deterministically from real data rather than carrying a hardcoded figure.
 */
export interface UsageSeriesResponse {
  points: UsagePoint[];
  /** Equivalent docs total from the immediately prior 30-day window. */
  priorTotal: number;
}

/** Builds 30 daily points ending today. Deterministic per day. */
export function buildUsageSeries(): UsagePoint[] {
  const points: UsagePoint[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const day = d.getDay();
    // Weekend dip + slow uptrend + bounded noise.
    const weekend = day === 0 || day === 6 ? 0.55 : 1;
    const trend = 1 + (30 - i) * 0.012;
    const wobble = 1 + Math.sin(i * 1.3) * 0.18 + Math.cos(i * 0.6) * 0.09;
    const base = 1450 * weekend * trend * wobble;
    points.push({
      date: d.toISOString().slice(0, 10),
      value: Math.round(base),
    });
  }
  return points;
}

/** Builds the full usage payload with a plausible prior-window total. */
export function buildUsageSeriesResponse(): UsageSeriesResponse {
  const points = buildUsageSeries();
  const currentTotal = points.reduce((sum, p) => sum + p.value, 0);
  // The current window's series simulates ~12% growth over the prior one.
  const priorTotal = Math.round(currentTotal / 1.12);
  return { points, priorTotal };
}

export type ActivityKind =
  | "pipeline-run"
  | "deploy"
  | "drift"
  | "eval"
  | "agent"
  | "billing";

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  /** Short action verb shown at the top of the row. */
  action: string;
  /** Subject of the action (pipeline / endpoint / agent name). */
  subject: string;
  /** One-line detail line under the action. */
  detail: string;
  /** Relative-time string. */
  time: string;
  status: "success" | "warning" | "danger" | "info";
}

export const RECENT_ACTIVITY: ActivityEvent[] = [
  {
    id: "act-1",
    kind: "pipeline-run",
    action: "Pipeline run completed",
    subject: "COI Compliance",
    detail: "1,287 docs · 0.4% errors · P95 412 ms",
    time: "2m ago",
    status: "success",
  },
  {
    id: "act-2",
    kind: "deploy",
    action: "Deployed",
    subject: "Prior Auth v3.1.0",
    detail: "Promoted to us-east-1, eu-west-1 · golden set 36/36",
    time: "14m ago",
    status: "success",
  },
  {
    id: "act-3",
    kind: "drift",
    action: "Schema drift detected",
    subject: "Invoice v3",
    detail: "12 docs in 1h didn't match — confidence ↓ 0.07",
    time: "1h ago",
    status: "warning",
  },
  {
    id: "act-4",
    kind: "eval",
    action: "Eval set passed",
    subject: "KYC Processor",
    detail: "94% (26/28) — 2 cases sent to review",
    time: "3h ago",
    status: "success",
  },
  {
    id: "act-5",
    kind: "agent",
    action: "Agent escalated",
    subject: "Contract Router",
    detail: "Low-confidence DPA routed to L2 reviewer pool",
    time: "5h ago",
    status: "info",
  },
  {
    id: "act-6",
    kind: "pipeline-run",
    action: "Pipeline run failed",
    subject: "Contract Review",
    detail: "8% error rate · 14 docs sent to review queue",
    time: "8h ago",
    status: "danger",
  },
  {
    id: "act-7",
    kind: "billing",
    action: "Approaching cap",
    subject: "Monthly usage",
    detail: "389k of 500k docs · auto-upgrade disabled",
    time: "yesterday",
    status: "warning",
  },
  {
    id: "act-8",
    kind: "deploy",
    action: "Rolled back",
    subject: "COI Compliance v2.3.7",
    detail: "Confidence regressions on Carrier supplement",
    time: "2d ago",
    status: "warning",
  },
];

/**
 * KPI labels are owned by the client (see `KPI_LABELS_BY_TIER` in Home.tsx)
 * because they're product copy that should stay stable across loading / empty
 * / ready states. The API only ships values + deltas.
 */
export interface KpiEntry {
  value: string | number;
  delta?: number;
  description?: string;
  deltaDirection?: "up" | "down" | "flat";
}

export const FREE_KPIS: KpiEntry[] = [
  { value: "247 / 500" },
  { value: 189 },
  { value: 3 },
  { value: 1 },
];

export function proKpisFor(docs30d: number): KpiEntry[] {
  return [
    { value: docs30d.toLocaleString(), delta: 0.12 },
    { value: 12, delta: 0.16 },
    { value: 7, delta: 0.4 },
    { value: "94.6%", delta: 0.02 },
  ];
}

export function enterpriseKpisFor(docs30d: number): KpiEntry[] {
  return [
    { value: docs30d.toLocaleString(), delta: 0.18 },
    { value: "412 ms", delta: -0.05 },
    { value: "96.2%", delta: 0.01 },
    { value: "99.987%" },
  ];
}

export interface RegionHealth {
  name: string;
  status: "healthy" | "degraded" | "down";
  meta: string;
}

export const REGION_HEALTH: RegionHealth[] = [
  {
    name: "us-east-1",
    status: "healthy",
    meta: "2.1k/min · P95 287ms · 99.99% uptime",
  },
  {
    name: "eu-west-1",
    status: "healthy",
    meta: "1.4k/min · P95 312ms · 99.98% uptime",
  },
  {
    name: "ap-southeast-1",
    status: "degraded",
    meta: "412/min · P95 521ms · 99.92% uptime · degraded",
  },
];

/**
 * Starter pipelines offered by the Home fork wizard. Forking clones one of
 * these templates as the seed for a new developer pipeline. Every template
 * runs the same four canonical stages (Ingest → Validate → Secure → Store);
 * the fixtures differ only in framing copy and which document types they target.
 */
export interface PipelineTemplate {
  id: string;
  /** Display name shown on the template chip and the ready-state header. */
  name: string;
  /** One-line description of what the forked pipeline does. */
  blurb: string;
  /** Document types this template is tuned for. */
  docTypes: string[];
  accent: "blue" | "purple" | "green" | "amber";
}

export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  {
    id: "coi-compliance",
    name: "COI Compliance",
    blurb: "Validate certificates of insurance against carrier requirements.",
    docTypes: ["Certificates of insurance", "Loss runs"],
    accent: "blue",
  },
  {
    id: "accounts-payable",
    name: "Accounts Payable",
    blurb: "Extract line items, match POs, and flag duplicate invoices.",
    docTypes: ["Invoices", "Purchase orders"],
    accent: "green",
  },
  {
    id: "contract-review",
    name: "Contract Review",
    blurb: "Classify clauses, redact PII, and route to the right reviewer.",
    docTypes: ["MSAs", "DPAs", "NDAs"],
    accent: "purple",
  },
  {
    id: "prior-authorization",
    name: "Prior Authorization",
    blurb: "Read auth requests, check coverage, and assemble payer packets.",
    docTypes: ["Auth requests", "Clinical notes"],
    accent: "amber",
  },
];

/**
 * The four canonical stages every forked pipeline runs. Fixed and ordered —
 * the wizard's build animation lights them up left-to-right.
 */
export interface PipelineStage {
  key: string;
  label: string;
  /** What the stage does, shown under the label in the ready-state grid. */
  detail: string;
}

export const PIPELINE_STAGES: PipelineStage[] = [
  { key: "ingest", label: "Ingest", detail: "Accept, normalize, deduplicate" },
  { key: "validate", label: "Validate", detail: "Classify and check schema" },
  { key: "secure", label: "Secure", detail: "Redact PII, encrypt at rest" },
  { key: "store", label: "Store", detail: "Emit JSON, persist, notify" },
];

export interface OnboardingStep {
  id: string;
  title: string;
  blurb: string;
  done: boolean;
  /** What to render in the per-step CTA slot. */
  cta?: { kind: "try-op" } | { kind: "navigate"; target: string };
}

export const FREE_ONBOARDING: OnboardingStep[] = [
  {
    id: "first-op",
    title: "Run your first operation",
    blurb: "Try extract, redact, or OCR on a sample document.",
    done: true,
    cta: { kind: "try-op" },
  },
  {
    id: "connect-source",
    title: "Connect a source",
    blurb: "Attach an S3 bucket, webhook, or email inbox.",
    done: false,
    cta: { kind: "navigate", target: "sources" },
  },
  {
    id: "build-pipeline",
    title: "Build a pipeline",
    blurb: "Compose ops into a repeatable workflow.",
    done: false,
    cta: { kind: "navigate", target: "pipelines" },
  },
  {
    id: "wire-agent",
    title: "Wire an agent",
    blurb: "Expose Stirling via MCP or REST tool definitions.",
    done: false,
    cta: { kind: "navigate", target: "sources" },
  },
];
