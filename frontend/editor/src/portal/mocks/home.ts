/**
 * Home dashboard fixtures. Types and the pipeline template/stage catalogues
 * live in api/home.ts (the backend contract); this module only builds fake
 * data for Storybook and tests.
 *
 * The MSW handlers in mocks/handlers/ serve the fixture data over the
 * intercepted apiClient.local.json() calls. Components never reach into this
 * module directly. The handlers serve Storybook and tests, so these fixtures
 * stay in sync with the api contract for as long as those need them.
 */

import type {
  ActivityEvent,
  KpiEntry,
  OnboardingStep,
  RegionHealth,
  UsagePoint,
  UsageSeriesResponse,
} from "@portal/api/home";

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
