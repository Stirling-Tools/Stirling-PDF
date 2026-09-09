/** Assembles the home visualiser's sources → policies → outcomes from the real
 *  sources/policies/runs APIs. Counts are real; the flow motion is illustrative. */

import type { SourcesResponse } from "@portal/api/sources";
import { POLICY_CATEGORIES } from "@portal/api/policies";
import { fromWirePolicy } from "@app/policies/codec";
import type { PolicyRunView, WirePolicy } from "@app/policies/types";

/** A source that actually feeds the processor today (editor, folder, S3, …). */
export interface FlowSource {
  id: string;
  /** Display name (already resolved; editor rows get a friendly label). */
  name: string;
  type: string;
  /** Documents this source fed into runs over the trailing 24h. */
  docs24h: number;
}

/** A "coming soon" connector shown in the sources column but not a real source
 *  type yet. `labelKey` is an i18n key. */
export interface FlowComingSoonSource {
  key: string;
  labelKey: string;
}

/** Row state (mirrors the Policies page): `active` = configured+enabled with a
 *  24h count, `off` = available (offers "Set up"), `locked` = coming-soon. */
export type FlowPolicyState = "active" | "off" | "locked";

/** One policies-column row — the full catalogue in Policies-page order,
 *  including the coming-soon categories. */
export interface FlowPolicy {
  /** Category id (also the lane key for the flow animation + its icon). */
  key: string;
  /** i18n key for the category label. */
  labelKey: string;
  state: FlowPolicyState;
  configured: boolean;
  runs24h: number;
}

export type FlowOutcomeKey = "success" | "failed";

/** A terminal audit outcome node on the right, counted over the trailing 24h. */
export interface FlowOutcome {
  key: FlowOutcomeKey;
  labelKey: string;
  count24h: number;
}

export interface ProcessorFlow {
  sources: FlowSource[];
  comingSoonSources: FlowComingSoonSource[];
  policies: FlowPolicy[];
  outcomes: FlowOutcome[];
}

const DAY_MS = 86_400_000;

/** Connector types the sources column advertises but can't create yet. */
const COMING_SOON_SOURCES: FlowComingSoonSource[] = [
  { key: "apiMcp", labelKey: "portal.processorFlow.sources.comingSoon.apiMcp" },
  {
    key: "cloud",
    labelKey: "portal.processorFlow.sources.comingSoon.cloud",
  },
  {
    key: "email",
    labelKey: "portal.processorFlow.sources.comingSoon.email",
  },
];

/** Full catalogue in Policies-page order (coming-soon → locked); `active` rows
 *  carry their trailing-24h run count. */
function buildPolicies(
  wirePolicies: WirePolicy[],
  runs: PolicyRunView[],
): FlowPolicy[] {
  const cutoff = Date.now() - DAY_MS;
  const decoded = wirePolicies.map(fromWirePolicy);

  return POLICY_CATEGORIES.map((cat) => {
    const dp = decoded.find((p) => p.categoryId === cat.id);
    const configured = Boolean(dp?.enabled);
    const state: FlowPolicyState = configured
      ? "active"
      : cat.comingSoon
        ? "locked"
        : "off";
    const runs24h = dp
      ? runs.filter((r) => r.policyId === dp.id && r.createdAt >= cutoff).length
      : 0;
    return {
      key: cat.id,
      labelKey: cat.label,
      state,
      configured,
      runs24h,
    };
  });
}

/** Terminal audit outcomes over the trailing 24h — success vs failure. */
function buildOutcomes(runs: PolicyRunView[]): FlowOutcome[] {
  const cutoff = Date.now() - DAY_MS;
  const recent = runs.filter((r) => r.createdAt >= cutoff);
  const success = recent.filter((r) => r.status === "COMPLETED").length;
  const failed = recent.filter(
    (r) => r.status === "FAILED" || r.status === "CANCELLED",
  ).length;
  return [
    {
      key: "success",
      labelKey: "portal.processorFlow.outcomes.success",
      count24h: success,
    },
    {
      key: "failed",
      labelKey: "portal.processorFlow.outcomes.failed",
      count24h: failed,
    },
  ];
}

/**
 * Pure assembly of the flow model from the three raw responses. Split out so
 * the React Query layer composes it from the shared sources/policies/runs
 * cache entries instead of re-fetching them (see useProcessorFlow).
 */
export function assembleProcessorFlow(
  sourcesResp: SourcesResponse,
  wirePolicies: WirePolicy[],
  runs: PolicyRunView[],
): ProcessorFlow {
  const sources: FlowSource[] = sourcesResp.sources.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    docs24h: s.docs24h,
  }));

  return {
    sources,
    comingSoonSources: COMING_SOON_SOURCES,
    policies: buildPolicies(wirePolicies, runs),
    outcomes: buildOutcomes(runs),
  };
}
