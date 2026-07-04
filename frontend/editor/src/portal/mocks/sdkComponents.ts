/**
 * Components surface fixtures and the types api/sdkComponents.ts shares with them.
 *
 * "Components" are embeddable React/Vue/Vanilla SDK widgets a developer drops
 * into their own product — a PDF Viewer, an E-Sign flow, an AI Review panel —
 * each metered per action (per render, per review, per signature). Every
 * component carries its npm package, maturity, supported frameworks, per-action
 * price, an install/usage snippet, and its key props.
 *
 * api/sdkComponents.ts imports the types; the MSW handlers serve the fixture
 * data over the intercepted apiClient.local.json() calls. Components never reach into this
 * module directly. Once a real backend exists the handlers stop being
 * registered and these fixtures can be deleted (or kept as test seeds).
 */

import type { Tier } from "@portal/contexts/TierContext";

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

/* ──────────────────────────────────────────────────────────────────────── */
/*  Fixtures                                                                 */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * The catalogue. Authored once, then filtered/repriced per tier so a dev can
 * see tier variation (locked Beta components on free, enterprise discounts).
 */
const CATALOGUE: SdkComponent[] = [
  {
    id: "viewer",
    name: "Viewer",
    package: "viewer",
    description:
      "Drop-in PDF viewer with text selection, search, thumbnails and lazy page rendering. The cheapest, highest-volume primitive.",
    maturity: "ga",
    frameworks: ["React", "Vue", "Vanilla"],
    pricing: { pricePerAction: 0.01, unit: "render", freeQuota: 1000 },
    install: "npm install @stirling/viewer",
    usage: `import { Viewer } from "@stirling/viewer";

export function DocumentPage({ fileUrl }: { fileUrl: string }) {
  return (
    <Viewer
      src={fileUrl}
      apiKey={process.env.STIRLING_KEY}
      onRender={(p) => console.log("rendered page", p.page)}
    />
  );
}`,
    props: [
      {
        name: "src",
        type: "string | Blob",
        required: true,
        description: "Document URL or in-memory blob to render.",
      },
      {
        name: "apiKey",
        type: "string",
        required: true,
        description: "Publishable key used to meter renders.",
      },
      {
        name: "initialPage",
        type: "number",
        required: false,
        description: "Page to open on first render. Defaults to 1.",
      },
      {
        name: "onRender",
        type: "(e: RenderEvent) => void",
        required: false,
        description: "Fires per rendered page — one billed render each.",
      },
    ],
    embeds30d: 184200,
    minTier: "pro",
  },
  {
    id: "review",
    name: "Review",
    package: "review",
    description:
      "AI-assisted document review panel — surfaces extracted fields, risks and suggested redactions for a human to accept or reject.",
    maturity: "ga",
    frameworks: ["React", "Vue"],
    pricing: { pricePerAction: 0.04, unit: "review", freeQuota: 50 },
    install: "npm install @stirling/review",
    usage: `import { Review } from "@stirling/review";

export function ReviewPane({ docId }: { docId: string }) {
  return (
    <Review
      documentId={docId}
      pipeline="invoice-v3"
      apiKey={process.env.STIRLING_KEY}
      onComplete={(r) => save(r.fields)}
    />
  );
}`,
    props: [
      {
        name: "documentId",
        type: "string",
        required: true,
        description: "Id of an ingested document to review.",
      },
      {
        name: "pipeline",
        type: "string",
        required: true,
        description: "Pipeline whose extraction schema drives the panel.",
      },
      {
        name: "onComplete",
        type: "(r: ReviewResult) => void",
        required: false,
        description: "Called when the reviewer submits — bills one review.",
      },
    ],
    embeds30d: 42800,
    minTier: "pro",
  },
  {
    id: "confidence",
    name: "Confidence",
    package: "confidence",
    description:
      "Inline confidence overlay — paints per-field certainty heatmaps over extracted values so reviewers triage low-confidence fields first.",
    maturity: "ga",
    frameworks: ["React", "Vue", "Vanilla"],
    pricing: { pricePerAction: 0.02, unit: "check", freeQuota: 200 },
    install: "npm install @stirling/confidence",
    usage: `import { Confidence } from "@stirling/confidence";

export function FieldOverlay({ result }: { result: ExtractResult }) {
  return <Confidence fields={result.fields} threshold={0.85} />;
}`,
    props: [
      {
        name: "fields",
        type: "ExtractedField[]",
        required: true,
        description: "Fields with per-value confidence scores.",
      },
      {
        name: "threshold",
        type: "number",
        required: false,
        description: "Highlight fields below this 0..1 score. Defaults to 0.8.",
      },
    ],
    embeds30d: 31500,
    minTier: "pro",
  },
  {
    id: "approval",
    name: "Approval",
    package: "approval",
    description:
      "Routable approval flow — assign reviewers, collect sign-offs and enforce approval order before a document advances.",
    maturity: "ga",
    frameworks: ["React", "Vue"],
    pricing: { pricePerAction: 0.1, unit: "approval", freeQuota: 0 },
    install: "npm install @stirling/approval",
    usage: `import { Approval } from "@stirling/approval";

export function ApprovalGate({ docId }: { docId: string }) {
  return (
    <Approval
      documentId={docId}
      approvers={["ap@acme.com", "controller@acme.com"]}
      order="sequential"
      onApproved={() => advance(docId)}
    />
  );
}`,
    props: [
      {
        name: "documentId",
        type: "string",
        required: true,
        description: "Document the approval gate guards.",
      },
      {
        name: "approvers",
        type: "string[]",
        required: true,
        description: "Ordered list of approver email addresses.",
      },
      {
        name: "order",
        type: '"sequential" | "parallel"',
        required: false,
        description: "Routing mode. Defaults to sequential.",
      },
    ],
    embeds30d: 9600,
    minTier: "pro",
  },
  {
    id: "esign",
    name: "E-Sign",
    package: "esign",
    description:
      "Legally-binding e-signature ceremony — signer fields, audit-grade consent capture and a tamper-evident completion certificate.",
    maturity: "ga",
    frameworks: ["React", "Vue", "Vanilla"],
    pricing: { pricePerAction: 0.35, unit: "signature", freeQuota: 0 },
    install: "npm install @stirling/esign",
    usage: `import { ESign } from "@stirling/esign";

export function SignFlow({ docId }: { docId: string }) {
  return (
    <ESign
      documentId={docId}
      signers={[{ email: "client@acme.com", role: "signer" }]}
      onSigned={(cert) => store(cert.certificateUrl)}
    />
  );
}`,
    props: [
      {
        name: "documentId",
        type: "string",
        required: true,
        description: "Document to be signed.",
      },
      {
        name: "signers",
        type: "Signer[]",
        required: true,
        description: "Ordered signers with email + role.",
      },
      {
        name: "onSigned",
        type: "(c: Certificate) => void",
        required: false,
        description: "Fires on completion — bills one signature per signer.",
      },
    ],
    embeds30d: 5400,
    minTier: "pro",
  },
  {
    id: "audit-trail",
    name: "Audit Trail",
    package: "audit-trail",
    description:
      "Read-only event timeline for a document — every render, edit, approval and signature, exportable as a compliance-grade ledger.",
    maturity: "ga",
    frameworks: ["React", "Vue"],
    pricing: { pricePerAction: 0.01, unit: "event", freeQuota: 500 },
    install: "npm install @stirling/audit-trail",
    usage: `import { AuditTrail } from "@stirling/audit-trail";

export function History({ docId }: { docId: string }) {
  return <AuditTrail documentId={docId} export="pdf" />;
}`,
    props: [
      {
        name: "documentId",
        type: "string",
        required: true,
        description: "Document whose events are shown.",
      },
      {
        name: "export",
        type: '"pdf" | "csv" | false',
        required: false,
        description: "Enable a ledger export button. Defaults to false.",
      },
    ],
    embeds30d: 14200,
    minTier: "pro",
  },
  {
    id: "markup",
    name: "Markup",
    package: "markup",
    description:
      "Collaborative annotation layer — highlights, comments, stamps and freehand drawing synced live across reviewers.",
    maturity: "beta",
    frameworks: ["React", "Vue"],
    pricing: { pricePerAction: 0.03, unit: "session", freeQuota: 25 },
    install: "npm install @stirling/markup@beta",
    usage: `import { Markup } from "@stirling/markup";

export function AnnotateLayer({ docId }: { docId: string }) {
  return (
    <Markup
      documentId={docId}
      collaborative
      tools={["highlight", "comment", "stamp"]}
    />
  );
}`,
    props: [
      {
        name: "documentId",
        type: "string",
        required: true,
        description: "Document to annotate.",
      },
      {
        name: "collaborative",
        type: "boolean",
        required: false,
        description: "Enable live multi-user sync. Defaults to false.",
      },
      {
        name: "tools",
        type: "MarkupTool[]",
        required: false,
        description: "Visible annotation tools. Defaults to all.",
      },
    ],
    embeds30d: 2100,
    minTier: "pro",
  },
  {
    id: "toolkit",
    name: "Toolkit",
    package: "toolkit",
    description:
      "Headless operations toolkit — merge, split, redact, compress and convert exposed as composable hooks with no UI of its own.",
    maturity: "beta",
    frameworks: ["React", "Vue", "Vanilla"],
    pricing: { pricePerAction: 0.05, unit: "event", freeQuota: 0 },
    install: "npm install @stirling/toolkit@beta",
    usage: `import { useToolkit } from "@stirling/toolkit";

export function MergeButton({ files }: { files: File[] }) {
  const { merge } = useToolkit({ apiKey: process.env.STIRLING_KEY });
  return <button onClick={() => merge(files)}>Merge</button>;
}`,
    props: [
      {
        name: "apiKey",
        type: "string",
        required: true,
        description: "Publishable key used to meter operations.",
      },
      {
        name: "operations",
        type: "Operation[]",
        required: false,
        description: "Restrict the toolkit to a subset of operations.",
      },
    ],
    // Beta + enterprise-only: still gated to design partners, never embedded
    // on lower tiers.
    embeds30d: 0,
    minTier: "enterprise",
  },
];

/* ──────────────────────────────────────────────────────────────────────── */
/*  Tier shaping                                                             */
/* ──────────────────────────────────────────────────────────────────────── */

const TIER_RANK: Record<Tier, number> = { free: 0, pro: 1, enterprise: 2 };

/**
 * Enterprise negotiates volume pricing — renders and reviews come in cheaper.
 * Applied as a flat per-tier multiplier so the catalogue stays single-sourced.
 */
function priceFor(component: SdkComponent, tier: Tier): ComponentPricing {
  if (tier !== "enterprise") return component.pricing;
  return {
    ...component.pricing,
    pricePerAction: Number((component.pricing.pricePerAction * 0.8).toFixed(3)),
  };
}

/**
 * The catalogue for a tier. Every component is returned at every tier so the
 * grid is browsable — the view locks the ones above the tier and shows an
 * upgrade nudge. Pricing is re-stamped per tier.
 */
export function componentsFor(tier: Tier): SdkComponent[] {
  return CATALOGUE.map((c) => ({ ...c, pricing: priceFor(c, tier) }));
}

/** Whether a component is usable at the given tier (vs locked/upgrade). */
export function isUnlocked(component: SdkComponent, tier: Tier): boolean {
  return TIER_RANK[tier] >= TIER_RANK[component.minTier];
}

export function summaryFor(tier: Tier): ComponentsSummary {
  const components = componentsFor(tier);
  const unlocked = components.filter((c) => isUnlocked(c, tier));
  const gaCount = unlocked.filter((c) => c.maturity === "ga").length;
  const betaCount = unlocked.filter((c) => c.maturity === "beta").length;

  if (tier === "free") {
    // Free hasn't embedded anything yet — the strip reads as a cold start.
    return { gaCount, betaCount, embedsThisMonth: 0, spendThisMonth: 0 };
  }

  const embedsThisMonth = unlocked.reduce((sum, c) => sum + c.embeds30d, 0);
  // Spend = embeds beyond the free quota, billed at the tier price.
  const spendThisMonth = unlocked.reduce((sum, c) => {
    const billable = Math.max(0, c.embeds30d - c.pricing.freeQuota);
    return sum + billable * c.pricing.pricePerAction;
  }, 0);

  return {
    gaCount,
    betaCount,
    embedsThisMonth,
    spendThisMonth: Number(spendThisMonth.toFixed(2)),
  };
}

export function buildComponentsResponse(tier: Tier): ComponentsResponse {
  return { summary: summaryFor(tier), components: componentsFor(tier) };
}
