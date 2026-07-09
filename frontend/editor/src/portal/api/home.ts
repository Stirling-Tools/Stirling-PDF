import { apiClient } from "@portal/api/http";
import type { Tier } from "@portal/contexts/TierContext";

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

export interface RegionHealth {
  name: string;
  status: "healthy" | "degraded" | "down";
  meta: string;
}

/**
 * Starter pipelines offered by the Home fork wizard. Forking clones one of
 * these templates as the seed for a new developer pipeline. Every template
 * runs the same four canonical stages (Ingest → Validate → Secure → Store);
 * the entries differ only in framing copy and which document types they target.
 */
export interface PipelineTemplate {
  id: string;
  /** Display name shown on the template chip and the ready-state header. */
  name: string;
  /** One-line description of what the forked pipeline does. */
  blurb: string;
  docTypesKey: string;
  accent: "blue" | "purple" | "green" | "amber";
}

/** `name`/`blurb` values are i18n keys; `docTypesKey` resolves to a comma-
    separated list — render with t(). */
export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  {
    id: "coi-compliance",
    name: "portal.home.pipelineTemplates.coiCompliance.name",
    blurb: "portal.home.pipelineTemplates.coiCompliance.blurb",
    docTypesKey: "portal.home.pipelineTemplates.coiCompliance.docTypes",
    accent: "blue",
  },
  {
    id: "accounts-payable",
    name: "portal.home.pipelineTemplates.accountsPayable.name",
    blurb: "portal.home.pipelineTemplates.accountsPayable.blurb",
    docTypesKey: "portal.home.pipelineTemplates.accountsPayable.docTypes",
    accent: "green",
  },
  {
    id: "contract-review",
    name: "portal.home.pipelineTemplates.contractReview.name",
    blurb: "portal.home.pipelineTemplates.contractReview.blurb",
    docTypesKey: "portal.home.pipelineTemplates.contractReview.docTypes",
    accent: "purple",
  },
  {
    id: "prior-authorization",
    name: "portal.home.pipelineTemplates.priorAuthorization.name",
    blurb: "portal.home.pipelineTemplates.priorAuthorization.blurb",
    docTypesKey: "portal.home.pipelineTemplates.priorAuthorization.docTypes",
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

/** `label`/`detail` values are i18n keys — render with t(). */
export const PIPELINE_STAGES: PipelineStage[] = [
  {
    key: "ingest",
    label: "portal.home.pipelineStages.ingest.label",
    detail: "portal.home.pipelineStages.ingest.detail",
  },
  {
    key: "validate",
    label: "portal.home.pipelineStages.validate.label",
    detail: "portal.home.pipelineStages.validate.detail",
  },
  {
    key: "secure",
    label: "portal.home.pipelineStages.secure.label",
    detail: "portal.home.pipelineStages.secure.detail",
  },
  {
    key: "store",
    label: "portal.home.pipelineStages.store.label",
    detail: "portal.home.pipelineStages.store.detail",
  },
];

export interface OnboardingStep {
  id: string;
  title: string;
  blurb: string;
  done: boolean;
  /** What to render in the per-step CTA slot. */
  cta?: { kind: "try-op" } | { kind: "navigate"; target: string };
}

/** GET /v1/analytics/usage?window=30d */
export async function fetchUsageSeries(): Promise<UsageSeriesResponse> {
  return apiClient.local.json<UsageSeriesResponse>(
    "/v1/analytics/usage?window=30d",
  );
}

/** GET /v1/activity?limit=8 */
export async function fetchRecentActivity(): Promise<ActivityEvent[]> {
  return apiClient.local.json<ActivityEvent[]>("/v1/activity?limit=8");
}

/** GET /v1/home/kpis?tier=… */
export async function fetchHomeKpis(tier: Tier): Promise<KpiEntry[]> {
  return apiClient.local.json<KpiEntry[]>(
    `/v1/home/kpis?tier=${encodeURIComponent(tier)}`,
  );
}

/** GET /v1/regions/health (Enterprise) */
export async function fetchRegionHealth(): Promise<RegionHealth[]> {
  return apiClient.local.json<RegionHealth[]>("/v1/regions/health");
}

/** GET /v1/onboarding (Free) */
export async function fetchOnboarding(): Promise<OnboardingStep[]> {
  return apiClient.local.json<OnboardingStep[]>("/v1/onboarding");
}
