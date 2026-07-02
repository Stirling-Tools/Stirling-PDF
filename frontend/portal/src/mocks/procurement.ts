/**
 * Procurement fixtures and the types api/procurement.ts shares with them.
 * api/procurement.ts imports the types; the MSW handlers in
 * mocks/handlers/procurement.ts serve this fixture data over the intercepted
 * httpJson() calls. Components never reach into this module directly.
 *
 * Procurement models the enterprise commercial journey, trial → quote →
 * agreement → payment → implementation, plus the paperwork ledger that rides
 * alongside it. The journey is enterprise-only; free/pro tiers receive a
 * minimal locked payload the view renders as an upgrade prompt.
 *
 * Once a real commercial backend exists the MSW handlers stop being registered
 * and these fixtures can be deleted (or kept as test seeds).
 */

import type { Tier } from "@portal/contexts/TierContext";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Journey stages                                                           */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * The five-stage enterprise journey. The id is the contract value the backend
 * advances; the labels below are the buyer-facing stage names (Agreement and
 * Payment read more plainly than the internal `security` / `procurement`).
 */
export type DealStage =
  | "trial"
  | "quote"
  | "security"
  | "procurement"
  | "active";

export interface JourneyStep {
  stage: DealStage;
  /** Buyer-facing stage name. */
  label: string;
  /** One-line description of what happens at this stage. */
  blurb: string;
  /**
   * Label for the single action that advances this stage. The current stage
   * surfaces its gating action; `active` is terminal (provisioning).
   */
  gatingAction: string;
}

/** Ordered journey definition, the stepper renders this verbatim. */
export const JOURNEY: JourneyStep[] = [
  {
    stage: "trial",
    label: "Trial",
    blurb: "Evaluate Stirling against your documents and workflows.",
    gatingAction: "Build your quote",
  },
  {
    stage: "quote",
    label: "Quote",
    blurb: "Review committed-volume pricing and contract term.",
    gatingAction: "Accept your quote",
  },
  {
    stage: "security",
    label: "Agreement",
    blurb: "One signature covers MSA, order form, EULA and DPA.",
    gatingAction: "Review and sign your agreement",
  },
  {
    stage: "procurement",
    label: "Payment",
    blurb: "Pay by card, bank transfer, or against a purchase order.",
    gatingAction: "Confirm payment",
  },
  {
    stage: "active",
    label: "Implementation",
    blurb: "Provision your workspace and run the go-live playbook.",
    gatingAction: "Provisioning your workspace",
  },
];

/* ──────────────────────────────────────────────────────────────────────── */
/*  Deal header                                                              */
/* ──────────────────────────────────────────────────────────────────────── */

export interface SolutionsEngineer {
  name: string;
  title: string;
  email: string;
}

export interface TrialInfo {
  /** License key seeded for the evaluation. */
  key: string;
  /** ISO date the trial began. */
  startedOn: string;
  /** ISO date the trial expires. */
  endsOn: string;
  /** Whole days remaining (derived in the fixture for a stable demo number). */
  daysLeft: number;
  extensionsUsed: number;
  maxExtensions: number;
}

export interface QuoteInfo {
  number: string;
  /** Annual contract value, in USD. */
  amount: number;
  /** Contract term, e.g. "12 months". */
  term: string;
  /** ISO date the quote expires. */
  validUntil: string;
}

export interface Deal {
  company: string;
  currentStage: DealStage;
  engineer: SolutionsEngineer;
  trial: TrialInfo;
  quote: QuoteInfo;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Document ledger + supporting pool                                        */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * Lifecycle of a single document.
 *   available: ready to grab now (download/sign/pay/upload as the action says)
 *   action:   waiting on the buyer to act (the gating paperwork of a stage)
 *   pending:  issued, awaiting the other side / a system step
 *   request:  not generated yet; the buyer asks for it (some carry a fee)
 *   complete: done, kept for the record
 */
export type DocStatus =
  | "available"
  | "action"
  | "pending"
  | "request"
  | "complete";

/** What pressing the document's button does. */
export type DocAction = "download" | "sign" | "pay" | "upload" | "request";

export interface LedgerDoc {
  id: string;
  name: string;
  /** Sub-line describing what the document is / what it covers. */
  sub: string;
  status: DocStatus;
  action: DocAction;
  /** Buyer-skippable paperwork (e.g. paid onboarding). */
  optional?: boolean;
  /** One-off fee in USD when the document/service is a paid add-on. */
  fee?: number;
}

/** Document ledger grouped by the journey stage the paperwork belongs to. */
export interface LedgerGroup {
  stage: DealStage;
  /** Buyer-facing stage name (matches JourneyStep.label). */
  label: string;
  docs: LedgerDoc[];
}

/** Categories the stage-agnostic supporting pool is grouped under. */
export type SupportingCategory =
  | "security"
  | "legal"
  | "corporate"
  | "procurement";

export interface SupportingGroup {
  category: SupportingCategory;
  label: string;
  docs: LedgerDoc[];
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Full procurement payload                                                 */
/* ──────────────────────────────────────────────────────────────────────── */

export interface ProcurementResponse {
  tier: Tier;
  /** True only for enterprise, gates the whole journey + ledger. */
  unlocked: boolean;
  /** Present only when unlocked. */
  deal: Deal | null;
  journey: JourneyStep[];
  ledger: LedgerGroup[];
  supporting: SupportingGroup[];
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Fixtures                                                                 */
/* ──────────────────────────────────────────────────────────────────────── */

const ENTERPRISE_DEAL: Deal = {
  company: "Northwind Logistics",
  // The buyer has accepted the quote and is at the agreement signature, the
  // mid-journey state shows the most surface area (completed + active + ahead).
  currentStage: "security",
  engineer: {
    name: "Priya Raman",
    title: "Senior Solutions Engineer",
    email: "priya.raman@stirlingpdf.com",
  },
  trial: {
    key: "TRIAL-NWND-7F3A-2C9E",
    startedOn: daysFromNow(-23),
    endsOn: daysFromNow(7),
    daysLeft: 7,
    extensionsUsed: 1,
    maxExtensions: 2,
  },
  quote: {
    number: "Q-2026-0488",
    amount: 84_000,
    term: "12 months",
    validUntil: daysFromNow(14),
  },
};

/** Document ledger for the live enterprise deal, grouped by stage. */
const ENTERPRISE_LEDGER: LedgerGroup[] = [
  {
    stage: "trial",
    label: "Trial",
    docs: [
      {
        id: "doc-trial-quickstart",
        name: "Trial quick-start guide",
        sub: "Stand up the evaluation environment in under an hour.",
        status: "available",
        action: "download",
      },
      {
        id: "doc-trial-handout",
        name: "Evaluator handout",
        sub: "Share Stirling's capabilities with your evaluation team.",
        status: "available",
        action: "download",
      },
    ],
  },
  {
    stage: "quote",
    label: "Quote",
    docs: [
      {
        id: "doc-quote-formal",
        name: "Formal quote",
        sub: "Committed-volume pricing, term and line items, Q-2026-0488.",
        status: "complete",
        action: "download",
      },
    ],
  },
  {
    stage: "security",
    label: "Agreement",
    docs: [
      {
        id: "doc-agreement-enterprise",
        name: "Stirling Enterprise Agreement",
        sub: "One signature: MSA + order form + EULA + DPA.",
        status: "action",
        action: "sign",
      },
    ],
  },
  {
    stage: "procurement",
    label: "Payment",
    docs: [
      {
        id: "doc-pay-online",
        name: "Pay online",
        sub: "Card or bank transfer via Stripe.",
        status: "pending",
        action: "pay",
      },
      {
        id: "doc-pay-wire",
        name: "Bank transfer instructions",
        sub: "Wire details, plus RIB for EU buyers.",
        status: "pending",
        action: "download",
      },
      {
        id: "doc-pay-po",
        name: "Purchase order",
        sub: "Upload it and we invoice against it.",
        status: "request",
        action: "upload",
      },
    ],
  },
  {
    stage: "active",
    label: "Implementation",
    docs: [
      {
        id: "doc-active-playbook",
        name: "Go-live playbook",
        sub: "Cut-over steps, rollback plan, and success checks.",
        status: "pending",
        action: "download",
      },
      {
        id: "doc-active-admin",
        name: "Administrator setup guide",
        sub: "SSO, regions, audit export and seat provisioning.",
        status: "pending",
        action: "download",
      },
      {
        id: "doc-active-onboarding",
        name: "Onboarding & training",
        sub: "Guided rollout and live training for your team.",
        status: "request",
        action: "request",
        optional: true,
        fee: 7_500,
      },
    ],
  },
];

/** Stage-agnostic supporting documents, grouped by category. */
const ENTERPRISE_SUPPORTING: SupportingGroup[] = [
  {
    category: "security",
    label: "Security",
    docs: [
      {
        id: "sup-soc2",
        name: "SOC 2 Type II report",
        sub: "Independent audit of our security controls.",
        status: "available",
        action: "download",
      },
      {
        id: "sup-caiq",
        name: "Security questionnaire (CAIQ)",
        sub: "Pre-filled Consensus Assessments Initiative Questionnaire.",
        status: "available",
        action: "download",
      },
      {
        id: "sup-pentest",
        name: "Penetration test summary",
        sub: "Latest third-party penetration test results.",
        status: "available",
        action: "download",
      },
      {
        id: "sup-custom-review",
        name: "Custom security review",
        sub: "Dedicated session with our security team for your assessment.",
        status: "request",
        action: "request",
        fee: 5_000,
      },
    ],
  },
  {
    category: "legal",
    label: "Legal",
    docs: [
      {
        id: "sup-baa",
        name: "Business Associate Agreement (HIPAA)",
        sub: "Required when processing protected health information.",
        status: "request",
        action: "request",
        fee: 2_500,
      },
    ],
  },
  {
    category: "corporate",
    label: "Corporate",
    docs: [
      {
        id: "sup-w9",
        name: "IRS Form W-9",
        sub: "Our taxpayer identification for your records.",
        status: "available",
        action: "download",
      },
      {
        id: "sup-incorporation",
        name: "Certificate of Incorporation",
        sub: "Proof of our legal entity registration.",
        status: "available",
        action: "download",
      },
      {
        id: "sup-insurance",
        name: "Certificate of Insurance",
        sub: "Liability and cyber insurance coverage evidence.",
        status: "available",
        action: "download",
      },
    ],
  },
  {
    category: "procurement",
    label: "Procurement",
    docs: [
      {
        id: "sup-vendor-onboarding",
        name: "Vendor onboarding form",
        sub: "We fill out your procurement-portal forms for you.",
        status: "request",
        action: "request",
        fee: 1_500,
      },
    ],
  },
];

/** Structured deep clone of plain fixture data (no functions / class instances). */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * A fresh, mutable copy of the live enterprise deal, deal header, stage ledger
 * and supporting pool. The MSW layer seeds its in-memory store from this so the
 * write handlers can advance the journey within a session without mutating the
 * shared fixtures. The journey definition (JOURNEY) is immutable and shared.
 */
export function seedEnterpriseDeal(): {
  deal: Deal;
  ledger: LedgerGroup[];
  supporting: SupportingGroup[];
} {
  return {
    deal: clone(ENTERPRISE_DEAL),
    ledger: clone(ENTERPRISE_LEDGER),
    supporting: clone(ENTERPRISE_SUPPORTING),
  };
}

/**
 * Builds the procurement payload for a tier. Enterprise gets the full live
 * deal; free/pro get a minimal locked payload the view renders as an
 * "enterprise-only" upgrade state.
 */
export function buildProcurement(tier: Tier): ProcurementResponse {
  if (tier !== "enterprise") {
    // Locked tiers still receive the journey definition so the view can render
    // a greyed preview of the steps behind the upgrade prompt.
    return {
      tier,
      unlocked: false,
      deal: null,
      journey: JOURNEY,
      ledger: [],
      supporting: [],
    };
  }

  return {
    tier,
    unlocked: true,
    deal: ENTERPRISE_DEAL,
    journey: JOURNEY,
    ledger: ENTERPRISE_LEDGER,
    supporting: ENTERPRISE_SUPPORTING,
  };
}

/** ISO date (YYYY-MM-DD) `n` days from today; negative for the past. */
function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
