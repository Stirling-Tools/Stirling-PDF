import { apiClient } from "@portal/api/http";
import { getSupabaseClient } from "@app/auth/supabase/supabaseClient";
import type { Tier } from "@portal/contexts/TierContext";

/*
 * Procurement models the enterprise commercial journey, trial → quote →
 * agreement → payment → implementation, plus the paperwork ledger that rides
 * alongside it. The journey is enterprise-only; free/pro tiers receive a
 * minimal locked payload the view renders as an upgrade prompt.
 */

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
/** `label`/`blurb`/`gatingAction` values are i18n keys — render with t(). */
export const JOURNEY: JourneyStep[] = [
  {
    stage: "trial",
    label: "portal.procurement.journeySteps.trial.label",
    blurb: "portal.procurement.journeySteps.trial.blurb",
    gatingAction: "portal.procurement.journeySteps.trial.gatingAction",
  },
  {
    stage: "quote",
    label: "portal.procurement.journeySteps.quote.label",
    blurb: "portal.procurement.journeySteps.quote.blurb",
    gatingAction: "portal.procurement.journeySteps.quote.gatingAction",
  },
  {
    stage: "security",
    label: "portal.procurement.journeySteps.agreement.label",
    blurb: "portal.procurement.journeySteps.agreement.blurb",
    gatingAction: "portal.procurement.journeySteps.agreement.gatingAction",
  },
  {
    stage: "procurement",
    label: "portal.procurement.journeySteps.payment.label",
    blurb: "portal.procurement.journeySteps.payment.blurb",
    gatingAction: "portal.procurement.journeySteps.payment.gatingAction",
  },
  {
    stage: "active",
    label: "portal.procurement.journeySteps.implementation.label",
    blurb: "portal.procurement.journeySteps.implementation.blurb",
    gatingAction: "portal.procurement.journeySteps.implementation.gatingAction",
  },
];

/**
 * The commercial flow's stepper stages. The real backend collapses quote + agreement into one
 * accept step (accepting the issued quote is accepting the agreement), so the flow shows one fewer
 * step than the mock ledger's {@link JOURNEY} — the separate "Agreement" step is dropped. Reuses
 * JOURNEY's i18n keys.
 */
export const FLOW_JOURNEY: JourneyStep[] = JOURNEY.filter(
  (s) => s.stage !== "security",
);

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

/** GET /v1/procurement?tier=…, the deal, journey, ledger and supporting pool. */
export async function fetchProcurement(
  tier: Tier,
): Promise<ProcurementResponse> {
  return apiClient.local.json<ProcurementResponse>(
    `/v1/procurement?tier=${encodeURIComponent(tier)}`,
  );
}

/*
 * Commercial actions. Each mutates the deal server-side and returns the updated
 * ProcurementResponse, the new canonical state, which the view applies so the
 * journey progresses. The MSW layer answers these today; a real backend honours
 * the same contracts unchanged.
 */

/** Advance the deal to the next stage (the journey's primary CTA). */
export async function advanceStage(
  fromStage: DealStage,
): Promise<ProcurementResponse> {
  return apiClient.local.json<ProcurementResponse>("/v1/procurement/advance", {
    method: "POST",
    body: { fromStage },
  });
}

/** Sign the Stirling Enterprise Agreement (MSA + order form + EULA + DPA). */
export async function signAgreement(
  docId: string,
): Promise<ProcurementResponse> {
  // A real backend opens an e-signature envelope and completes on callback;
  // here it completes immediately and advances the deal.
  return apiClient.local.json<ProcurementResponse>("/v1/procurement/sign", {
    method: "POST",
    body: { docId },
  });
}

/** Pay the contract online (card / bank transfer via Stripe). */
export async function payOnline(): Promise<ProcurementResponse> {
  return apiClient.local.json<ProcurementResponse>("/v1/procurement/pay", {
    method: "POST",
  });
}

/** Upload a purchase order to invoice against (an alternate payment path). */
export async function uploadPurchaseOrder(
  file: File,
): Promise<ProcurementResponse> {
  // A real backend takes the PO as multipart; the mock only needs the name.
  return apiClient.local.json<ProcurementResponse>(
    "/v1/procurement/purchase-order",
    {
      method: "POST",
      body: { fileName: file.name },
    },
  );
}

/** Request a document that is generated on demand (some carry a one-off fee). */
export async function requestDocument(
  docId: string,
  action: DocAction,
): Promise<ProcurementResponse> {
  return apiClient.local.json<ProcurementResponse>(
    `/v1/procurement/documents/${encodeURIComponent(docId)}/request`,
    { method: "POST", body: { action } },
  );
}

// ============================================================================
// Enterprise procurement — real SaaS backend (/api/v1/procurement).
//
// The journey/ledger visuals above still ride the MSW mock; the commercial spine
// below (trial, server-priced quote, accept -> Stripe checkout) is the real thing,
// served by the saas Java backend and gated on a linked account.
// ============================================================================

export type QuoteLineItemKind =
  | "RECURRING"
  | "ONE_TIME"
  | "DISCOUNT"
  | "INCLUDED";

export interface QuoteLineItem {
  key: string;
  label: string;
  kind: QuoteLineItemKind;
  amountMinor: number;
}

export interface QuoteResult {
  quoteId: number;
  quoteNumber: string;
  /** draft (priced, editable) | sent (issued Stripe quote — PDF + shareable) | accepted | expired. */
  status: string;
  currency: string;
  annualNetMinor: number;
  tcvMinor: number;
  /** First post-term renewal fee after the CPI escalator; the committed term itself is flat. */
  renewalAnnualNetMinor: number;
  /** The fixed CPI escalator applied per renewal, as a whole percent (e.g. 3). */
  cpiRatePct: number;
  lineItems: QuoteLineItem[];
  validUntil: string | null;
  /** The Stripe Quote id once issued; null while still a local draft. */
  stripeQuoteId: string | null;
  /** Hosted Stripe invoice URL, present once the quote is accepted and the subscription invoice exists. */
  invoiceUrl: string | null;
  /** Direct PDF link for that invoice; persisted so the download button survives a reload. */
  invoicePdf: string | null;
  /** The inputs this quote was priced from, so the builder can seed itself on re-edit. */
  config: QuoteConfigInput;
}

/** Outcome of accepting an issued quote: Stripe creates the subscription + first invoice. */
export interface AcceptResult {
  status: string;
  subscriptionId: string | null;
  invoiceUrl: string | null;
  invoicePdf: string | null;
}

/** One shape for every state; an unstarted procurement has {@link ProcurementSnapshot.dealId} null. */
export interface ProcurementSnapshot {
  dealId: number | null;
  stage: DealStage | null;
  /** cloud | selfhost | airgap — chosen at the trial-setup step; seeds the quote builder. */
  deployment: string;
  /** Seat count captured at trial setup (0 = unspecified); seeds the builder's volume estimate. */
  seats: number;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialExtensionsUsed: number;
  licensed: boolean;
  /** The team's Keygen licence key (present once licensed); shown in the portal to copy/install. */
  licenseKey: string | null;
  latestQuote: QuoteResult | null;
}

export interface QuoteConfigInput {
  volume: number;
  users: number;
  /** Policy posture (governance) as runs per PDF: Essentials 2, Governed 4, Regulated 7. */
  intensity: number;
  /** PDF-size tier multiplier on the rate: Compact 1.0, Standard 1.4, Heavy 2.4. */
  sizeMult: number;
  /** cloud | selfhost | airgap — set at the trial; drives the flat deployment fee + offline .lic. */
  deployment: string;
  termYears: number;
  serviceLevel: string;
  indemnification: boolean;
  training: boolean;
  qbr: boolean;
  /** Buyer's company name — shown on the quote/agreement and remembered when re-editing. */
  businessName: string;
}

export function fetchSnapshot(): Promise<ProcurementSnapshot> {
  return apiClient.saas.json<ProcurementSnapshot>("/api/v1/procurement");
}

/**
 * Download the offline / air-gapped licence file (.lic) as text. Only available when the paid
 * offline add-on was purchased; the server 404s (→ throws) otherwise.
 */
export function fetchLicenseFile(): Promise<string> {
  return apiClient.saas.text("/api/v1/procurement/license/file");
}

/**
 * Start the trial with the buyer's chosen deployment target and seat count (captured in the setup
 * step). These seed the quote builder; both remain editable when the quote is built.
 */
export function startTrial(
  deployment: string,
  seats: number,
): Promise<ProcurementSnapshot> {
  return apiClient.saas.json<ProcurementSnapshot>(
    "/api/v1/procurement/trial/start",
    { method: "POST", body: { deployment, users: seats } },
  );
}

export function extendTrial(): Promise<ProcurementSnapshot> {
  return apiClient.saas.json<ProcurementSnapshot>(
    "/api/v1/procurement/trial/extend",
    { method: "POST" },
  );
}

/** Advance an issued quote to the agreement (security) stage for review + agree. */
export function startAgreement(): Promise<ProcurementSnapshot> {
  return apiClient.saas.json<ProcurementSnapshot>(
    "/api/v1/procurement/agreement",
    { method: "POST" },
  );
}

/** Price a config server-side and persist it as a local DRAFT (no Stripe object yet). */
export function buildQuote(cfg: QuoteConfigInput): Promise<QuoteResult> {
  return apiClient.saas.json<QuoteResult>("/api/v1/procurement/quote", {
    method: "POST",
    body: cfg,
  });
}

// ---- Stripe Quote operations (Supabase edge functions) ---------------------
// Java has no Stripe SDK, so issuing/accepting the quote and fetching its PDF run in edge functions
// that own Stripe; they persist results back through SECURITY DEFINER RPCs. The portal invokes them
// directly (same pattern the PAYG checkout uses).

async function invokeEdge<T>(fn: string, quoteId: number): Promise<T> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("No SaaS session");
  const { data, error } = await supabase.functions.invoke<T>(fn, {
    body: { quote_id: quoteId },
  });
  if (error) throw error;
  if (data == null) throw new Error(`${fn} returned no data`);
  return data;
}

/** Turn a draft into an issued Stripe Quote (finalized → gets a number + PDF, shareable). */
export function issueQuote(quoteId: number): Promise<QuoteResult> {
  return invokeEdge<QuoteResult>("issue-procurement-quote", quoteId);
}

/** Accept an issued quote → Stripe creates the committed subscription + first invoice. */
export function acceptQuote(quoteId: number): Promise<AcceptResult> {
  return invokeEdge<AcceptResult>("accept-procurement-quote", quoteId);
}

/** Fetch the Stripe-generated quote PDF as a blob (for download / share). */
export async function fetchQuotePdf(quoteId: number): Promise<Blob> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("No SaaS session");
  const { data, error } = await supabase.functions.invoke<Blob>(
    "get-procurement-quote-pdf",
    { body: { quote_id: quoteId } },
  );
  if (error) throw error;
  if (!data) throw new Error("No PDF returned");
  return data;
}

/**
 * Demo/manual stand-in for the invoice.paid webhook: mark the deal live (issue licence, go active).
 */
export function goLive(): Promise<ProcurementSnapshot> {
  return apiClient.saas.json<ProcurementSnapshot>(
    "/api/v1/procurement/go-live",
    { method: "POST" },
  );
}

/** Reset the team's procurement (delete the deal) and get the fresh empty snapshot. */
export function resetProcurement(): Promise<ProcurementSnapshot> {
  return apiClient.saas.json<ProcurementSnapshot>("/api/v1/procurement/reset", {
    method: "POST",
  });
}
