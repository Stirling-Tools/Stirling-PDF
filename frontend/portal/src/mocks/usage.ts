/**
 * Usage & Billing fixtures and the types api/usage.ts shares with them.
 * api/usage.ts imports the types; the MSW handlers in mocks/handlers/usage.ts
 * serve this fixture data over the intercepted httpJson() calls. Components
 * never reach into this module directly.
 *
 * Once a real billing backend exists, the MSW handlers stop being registered
 * and these fixtures can be deleted (or kept as test seeds).
 */

import type { Tier } from "@portal/contexts/TierContext";
import {
  buildUsageSeries,
  buildUsageSeriesResponse,
  type UsageSeriesResponse,
} from "@portal/mocks/home";

export type { UsagePoint, UsageSeriesResponse } from "@portal/mocks/home";

/** Per-doc rate charged once the free cap is exceeded (pay-as-you-go). */
export const OVERAGE_RATE = 0.05;

/** Documents included before overage / cap kicks in, per tier. */
export const TIER_DOC_CAP: Record<Tier, number> = {
  free: 500,
  pro: 25_000,
  enterprise: 2_000_000,
};

/* ──────────────────────────────────────────────────────────────────────── */
/*  Billing summary (KPI strip + plan card)                                  */
/* ──────────────────────────────────────────────────────────────────────── */

export interface BillingSummary {
  tier: Tier;
  /** Human plan name shown on the current-plan card. */
  planName: string;
  /** Docs processed in the current billing period. */
  docsThisPeriod: number;
  /** Included docs before overage / cap. */
  includedDocs: number;
  /** Cost accrued this month, in USD. */
  costThisMonth: number;
  /** Overage docs past the included cap (0 when under). */
  overageDocs: number;
  /** Overage cost this month, in USD. */
  overageCost: number;
  /** Per-doc overage rate, in USD. */
  overageRate: number;
  /** Fixed monthly platform fee, in USD (0 for free / usage-only). */
  monthlyFee: number;
  /** ISO date the next invoice closes. */
  nextBillingDate: string;
  /** Optional user-set hard spend cap for the month, in USD. */
  spendCap: number | null;
  /** True when the free plan's doc cap has been reached. */
  capReached: boolean;
}

/** Builds a deterministic billing summary for a tier from the usage series. */
export function buildBillingSummary(tier: Tier): BillingSummary {
  const docs30d = buildUsageSeries().reduce((sum, p) => sum + p.value, 0);
  const included = TIER_DOC_CAP[tier];
  const nextBillingDate = nextMonthFirst();

  if (tier === "free") {
    // Free is gated, not metered — show progress toward the hard cap. 463/500
    // sits in the "approaching cap" band that drives the upgrade nudge.
    const docs = 463;
    return {
      tier,
      planName: "Free",
      docsThisPeriod: docs,
      includedDocs: included,
      costThisMonth: 0,
      overageDocs: 0,
      overageCost: 0,
      overageRate: OVERAGE_RATE,
      monthlyFee: 0,
      nextBillingDate,
      spendCap: null,
      capReached: docs >= included,
    };
  }

  if (tier === "enterprise") {
    // Committed-volume contract — usage sits comfortably inside the commit.
    return {
      tier,
      planName: "Enterprise (committed)",
      docsThisPeriod: docs30d,
      includedDocs: included,
      costThisMonth: 18_000,
      overageDocs: 0,
      overageCost: 0,
      overageRate: 0.018,
      monthlyFee: 18_000,
      nextBillingDate,
      spendCap: null,
      capReached: false,
    };
  }

  // Pro: pay-as-you-go with a small platform fee + metered overage.
  const monthlyFee = 49;
  const overageDocs = Math.max(0, docs30d - included);
  const overageCost = +(overageDocs * OVERAGE_RATE).toFixed(2);
  return {
    tier,
    planName: "Pay-as-you-go",
    docsThisPeriod: docs30d,
    includedDocs: included,
    costThisMonth: +(monthlyFee + overageCost).toFixed(2),
    overageDocs,
    overageCost,
    overageRate: OVERAGE_RATE,
    monthlyFee,
    nextBillingDate,
    spendCap: 2_500,
    capReached: false,
  };
}

/** First day of next month, ISO (YYYY-MM-DD) — the next invoice close date. */
function nextMonthFirst(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return next.toISOString().slice(0, 10);
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Plan catalogue (current + available plan cards)                          */
/* ──────────────────────────────────────────────────────────────────────── */

export interface PlanOption {
  tier: Tier;
  name: string;
  /** Headline price line, e.g. "$0" or "$0.05 / doc". */
  price: string;
  /** Cadence sub-line under the price, e.g. "forever" or "+ $49/mo platform". */
  priceCadence: string;
  /** One-line positioning blurb. */
  blurb: string;
  /** Bullet feature list. */
  features: string[];
}

export const PLAN_OPTIONS: PlanOption[] = [
  {
    tier: "free",
    name: "Free",
    price: "$0",
    priceCadence: "forever",
    blurb: "Kick the tyres on a single project.",
    features: [
      "500 docs / month",
      "All single operations",
      "1 pipeline · 1 agent",
      "Community support",
    ],
  },
  {
    tier: "pro",
    name: "Pay-as-you-go",
    price: "$0.05",
    priceCadence: "per doc · + $49/mo platform",
    blurb: "Scale with usage, only pay for what you process.",
    features: [
      "25,000 docs included",
      "Unlimited pipelines & agents",
      "Overage at $0.05 / doc",
      "Email support · 99.9% SLA",
    ],
  },
  {
    tier: "enterprise",
    name: "Enterprise",
    price: "Custom",
    priceCadence: "committed annual volume",
    blurb: "Committed volume, bespoke terms, dedicated regions.",
    features: [
      "Committed-volume pricing",
      "Dedicated & on-prem regions",
      "SSO · audit log export · DPA",
      "Named CSM · 99.99% SLA",
    ],
  },
];

/* ──────────────────────────────────────────────────────────────────────── */
/*  Billing history table                                                    */
/* ──────────────────────────────────────────────────────────────────────── */

export type InvoiceStatus = "paid" | "due" | "pending" | "refunded";

export interface BillingHistoryRow {
  id: string;
  /** ISO date the line item posted. */
  date: string;
  description: string;
  /** Docs attributed to the line item (0 for flat fees / credits). */
  docs: number;
  /** Amount in USD; negative for credits / refunds. */
  amount: number;
  status: InvoiceStatus;
}

export function buildBillingHistory(tier: Tier): BillingHistoryRow[] {
  if (tier === "free") {
    // Free has no charges — just the running tally line.
    return [
      {
        id: "bh-free-1",
        date: monthsAgo(0),
        description: "Free plan usage · 463 / 500 docs",
        docs: 463,
        amount: 0,
        status: "pending",
      },
      {
        id: "bh-free-2",
        date: monthsAgo(1),
        description: "Free plan usage · 500 / 500 docs (capped)",
        docs: 500,
        amount: 0,
        status: "paid",
      },
    ];
  }

  if (tier === "enterprise") {
    return [
      {
        id: "bh-ent-1",
        date: monthsAgo(0),
        description: "Committed volume · annual contract (monthly draw)",
        docs: 1_240_511,
        amount: 18_000,
        status: "pending",
      },
      {
        id: "bh-ent-2",
        date: monthsAgo(1),
        description: "Committed volume · annual contract (monthly draw)",
        docs: 1_188_204,
        amount: 18_000,
        status: "paid",
      },
      {
        id: "bh-ent-3",
        date: monthsAgo(1),
        description: "Dedicated region · ap-southeast-1 provisioning",
        docs: 0,
        amount: 4_500,
        status: "paid",
      },
      {
        id: "bh-ent-4",
        date: monthsAgo(2),
        description: "Committed volume · annual contract (monthly draw)",
        docs: 1_092_876,
        amount: 18_000,
        status: "paid",
      },
      {
        id: "bh-ent-5",
        date: monthsAgo(3),
        description: "Overage credit · region migration goodwill",
        docs: 0,
        amount: -1_200,
        status: "refunded",
      },
    ];
  }

  // Pro: platform fee + metered overage each cycle.
  const docs30d = buildUsageSeries().reduce((sum, p) => sum + p.value, 0);
  const overage = Math.max(0, docs30d - TIER_DOC_CAP.pro);
  return [
    {
      id: "bh-pro-1",
      date: monthsAgo(0),
      description: "Platform fee · current cycle",
      docs: 0,
      amount: 49,
      status: "due",
    },
    {
      id: "bh-pro-2",
      date: monthsAgo(0),
      description: `Document overage · ${overage.toLocaleString()} docs @ $0.05`,
      docs: overage,
      amount: +(overage * OVERAGE_RATE).toFixed(2),
      status: "due",
    },
    {
      id: "bh-pro-3",
      date: monthsAgo(1),
      description: "Platform fee · last cycle",
      docs: 0,
      amount: 49,
      status: "paid",
    },
    {
      id: "bh-pro-4",
      date: monthsAgo(1),
      description: "Document overage · 31,402 docs @ $0.05",
      docs: 31_402,
      amount: 1_570.1,
      status: "paid",
    },
    {
      id: "bh-pro-5",
      date: monthsAgo(2),
      description: "Platform fee · prior cycle",
      docs: 0,
      amount: 49,
      status: "paid",
    },
    {
      id: "bh-pro-6",
      date: monthsAgo(2),
      description: "Document overage · 18,945 docs @ $0.05",
      docs: 18_945,
      amount: 947.25,
      status: "paid",
    },
  ];
}

/** N whole months back from today, on the 1st, ISO (YYYY-MM-DD). */
function monthsAgo(n: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - n, 1);
  return d.toISOString().slice(0, 10);
}

/** Full usage payload for the 30-day chart — the same series Home charts. */
export function buildUsagePayload(): UsageSeriesResponse {
  return buildUsageSeriesResponse();
}
