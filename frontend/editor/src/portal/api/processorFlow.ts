/**
 * Processor-flow assembler for the home visualiser.
 *
 * Fans in the three real portal surfaces — sources (`/api/v1/sources`), policies
 * (`/api/v1/policies`) and their runs (`/api/v1/policies/runs`) — and derives the
 * left→middle→right shape the {@link ProcessorFlow} component renders:
 *
 *   sources  →  policies  →  outcomes
 *
 * Everything here is real backend data. Per-run source attribution does not
 * exist (a `PolicyRunView` carries `policyId` but no source id), so the flow
 * animation is illustrative; the node counts are not — each source's `docs24h`,
 * each policy's trailing-24h run count, and the success/failure split all come
 * straight from the API.
 */

import { apiClient } from "@portal/api/http";
import { fetchSources } from "@portal/api/sources";
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

/**
 * A connector type shown in the sources column but not yet a real source type —
 * a "coming soon" affordance only. `labelKey` is an i18n key.
 */
export interface FlowComingSoonSource {
  key: string;
  labelKey: string;
}

/**
 * Row display state, mirroring the Policies page:
 *   - `active`  — configured + enabled; shows its live 24h run count
 *   - `off`     — available but not set up; offers a "Set up" CTA
 *   - `locked`  — a coming-soon category that doesn't exist yet
 */
export type FlowPolicyState = "active" | "off" | "locked";

/**
 * One row in the middle policies column — the full policy catalogue, in the
 * same order the Policies page shows, including the coming-soon categories.
 */
export interface FlowPolicy {
  /** Category id (also the lane key for the flow animation). */
  key: string;
  /** i18n key for the category label. */
  labelKey: string;
  /** Material Symbols icon name (from the catalogue). */
  icon: string;
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

/**
 * The full policy catalogue, in the Policies-page order, including the
 * coming-soon categories (rendered as locked). `active` rows carry their
 * trailing-24h run count.
 */
function buildPolicies(
  wirePolicies: WirePolicy[],
  runs: PolicyRunView[],
): FlowPolicy[] {
  const cutoff = Date.now() - DAY_MS;
  const decoded = wirePolicies.map(fromWirePolicy);

  return POLICY_CATEGORIES.map((cat) => {
    const dp = decoded.find((p) => p.categoryId === cat.id);
    const configured = Boolean(dp?.enabled);
    const state: FlowPolicyState = cat.comingSoon
      ? "locked"
      : configured
        ? "active"
        : "off";
    const runs24h = dp
      ? runs.filter((r) => r.policyId === dp.id && r.createdAt >= cutoff).length
      : 0;
    return {
      key: cat.id,
      labelKey: cat.label,
      icon: cat.icon,
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

/** Assemble the full flow model from the three live portal surfaces. */
export async function fetchProcessorFlow(): Promise<ProcessorFlow> {
  const [sourcesResp, wirePolicies, runs] = await Promise.all([
    fetchSources(),
    apiClient.local.json<WirePolicy[]>("/api/v1/policies"),
    apiClient.local
      .json<PolicyRunView[]>("/api/v1/policies/runs")
      .catch(() => [] as PolicyRunView[]),
  ]);

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
