import { apiClient } from "@portal/api/http";
import type { Tier } from "@portal/contexts/TierContext";

/*
 * "Components" are embeddable React/Vue/Vanilla SDK widgets a developer drops
 * into their own product — a PDF Viewer, an E-Sign flow, an AI Review panel —
 * each metered per action (per render, per review, per signature). Every
 * component carries its npm package, maturity, supported frameworks, per-action
 * price, an install/usage snippet, and its key props.
 */

/* ──────────────────────────────────────────────────────────────────────── */
/*  Types                                                                    */
/* ──────────────────────────────────────────────────────────────────────── */

export type ComponentMaturity = "ga" | "beta";

export type Framework = "React" | "Vue" | "Vanilla";

/** The action a component bills against — surfaces in the price unit label. */
export type BillingUnit =
  | "render"
  | "review"
  | "approval"
  | "signature"
  | "check"
  | "event"
  | "session";

export interface ComponentProp {
  name: string;
  /** TypeScript-ish type expression, shown verbatim in the API table. */
  type: string;
  required: boolean;
  description: string;
}

export interface ComponentPricing {
  /** Price per billed action in USD. */
  pricePerAction: number;
  unit: BillingUnit;
  /** Free-tier monthly allowance before metering kicks in; 0 = none. */
  freeQuota: number;
}

export interface SdkComponent {
  id: string;
  name: string;
  /** Package suffix — full name is `@stirling/<package>`. */
  package: string;
  description: string;
  maturity: ComponentMaturity;
  frameworks: Framework[];
  pricing: ComponentPricing;
  /** Install command (npm). */
  install: string;
  /** Minimal usage snippet shown under the Code tab. */
  usage: string;
  props: ComponentProp[];
  /**
   * Embeds attributed to this component over the trailing 30 days — drives the
   * per-card usage line. Zero for never-embedded components.
   */
  embeds30d: number;
  /**
   * Tier at which the component becomes available. Components above the active
   * tier render locked with an upgrade nudge. `pro` is the default floor.
   */
  minTier: Tier;
}

export interface ComponentsSummary {
  /** Count of GA (production-ready) components available to the tier. */
  gaCount: number;
  /** Count of Beta components available to the tier. */
  betaCount: number;
  /** Total embeds across all components this month. */
  embedsThisMonth: number;
  /** Month-to-date spend attributed to component actions, in USD. */
  spendThisMonth: number;
}

export interface ComponentsResponse {
  summary: ComponentsSummary;
  components: SdkComponent[];
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Presentation metadata (client-side product copy, not data)              */
/* ──────────────────────────────────────────────────────────────────────── */

export interface MaturityMeta {
  label: string;
  tone: "success" | "info";
}

export const MATURITY_META: Record<ComponentMaturity, MaturityMeta> = {
  ga: { label: "GA", tone: "success" },
  beta: { label: "Beta", tone: "info" },
};

/** Human label for a billing unit, e.g. "render" → "/render". */
export const BILLING_UNIT_LABEL: Record<BillingUnit, string> = {
  render: "render",
  review: "review",
  approval: "approval",
  signature: "signature",
  check: "check",
  event: "event",
  session: "session",
};

/** Format a price as the per-action string shown on cards, e.g. "$0.04 / review". */
export function formatPrice(pricing: ComponentPricing): string {
  return `$${pricing.pricePerAction.toFixed(2)} / ${BILLING_UNIT_LABEL[pricing.unit]}`;
}

const TIER_RANK: Record<Tier, number> = { free: 0, pro: 1, enterprise: 2 };

/** Whether a component is usable at the given tier (vs locked/upgrade). */
export function isUnlocked(component: SdkComponent, tier: Tier): boolean {
  return TIER_RANK[tier] >= TIER_RANK[component.minTier];
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Endpoints                                                                */
/* ──────────────────────────────────────────────────────────────────────── */

/** GET /v1/components?tier=… — summary strip + the embeddable SDK catalogue. */
export async function fetchComponents(tier: Tier): Promise<ComponentsResponse> {
  return apiClient.local.json<ComponentsResponse>(
    `/v1/components?tier=${encodeURIComponent(tier)}`,
  );
}
