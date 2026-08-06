import { apiClient } from "@processor/api/http";
import { resolveDemoResponse } from "@processor/api/demoData";
import { saasApiBase } from "@processor/api/saasApiBase";
import { getSupabaseClient } from "@editor/auth/supabase/supabaseClient";

/*
 * Procurement models the enterprise commercial journey: trial → quote → agreement → payment →
 * implementation. It is surfaced by the deal-status hero on Home and the takeover flow beside it;
 * there is no separate procurement route.
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
  /** Asked about enterprise, nothing committed yet. Precedes the journey rather than joining it. */
  "exploring" | "trial" | "quote" | "security" | "procurement" | "active";

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

/**
 * The commercial flow's stages, rendered verbatim as the hero's progress band. Quote and Agreement
 * are distinct: the buyer accepts the quote first (no Stripe), then signs the agreement, which is
 * what accepts into a committed subscription.
 *
 * <p>`label`/`blurb`/`gatingAction` are i18n keys — render with t().
 */
export const FLOW_JOURNEY: JourneyStep[] = [
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

// ============================================================================
// Enterprise procurement — the real SaaS backend (/api/v1/procurement): trial,
// server-priced quote, agreement, accept -> Stripe. Gated on a linked account.
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
  /**
   * Stripe's quote number — the deal's one reference, shown on the quote, the agreement and the
   * invoice. Null while the quote is a local draft: Stripe assigns it only at finalisation.
   */
  quoteNumber: string | null;
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
  /** Version label of the signed agreement PDF available to download (e.g. "SEA v0.9.1"), else null. */
  agreementSignedVersion: string | null;
  /** Buying entity captured at trial setup; null on deals started before that step existed. */
  businessName: string | null;
  contactName: string | null;
  contactEmail: string | null;
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
  // Buyer / AP details (all optional). They flow onto the Stripe customer (name + bill-to address)
  // and the invoice (PO number + tax id as custom fields). Country + currency are out of scope.
  /** Signatory / main contact name. */
  contactName?: string;
  /** Contact email (billing / signatory). */
  contactEmail?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  /** State / province / region. */
  region?: string;
  postalCode?: string;
  /** Purchase-order number, shown on the invoice for AP matching. */
  poNumber?: string;
  /** VAT / Tax ID, shown on the invoice. */
  taxId?: string;
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
/** Details collected by trial setup's second step; every field optional server-side. */
export interface TrialSetupDetails {
  businessName?: string;
  contactName?: string;
  contactEmail?: string;
  /**
   * Raw comma/space/semicolon separated addresses. Recorded on the deal AND sent through the
   * team-invite path once the trial starts; a rejected address is skipped, never fatal.
   */
  inviteEmails?: string;
}

export function startTrial(
  deployment: string,
  seats: number,
  details?: TrialSetupDetails,
): Promise<ProcurementSnapshot> {
  return apiClient.saas.json<ProcurementSnapshot>(
    "/api/v1/procurement/trial/start",
    { method: "POST", body: { deployment, users: seats, ...details } },
  );
}

/**
 * Record that this account is looking at enterprise. Idempotent, and never disturbs an existing
 * deal — so it is safe to call on every entry into the flow.
 */
export function recordInterest(): Promise<ProcurementSnapshot> {
  return apiClient.saas.json<ProcurementSnapshot>(
    "/api/v1/procurement/interest",
    { method: "POST" },
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

/** The filled enterprise agreement (MSA + Order Form + DPA) for the current quote, as markdown. */
export interface AgreementDocument {
  docId: string;
  version: string;
  /** e.g. "SEA v0.9.1" — the exact document version a signature will be pinned to. */
  versionLabel: string;
  displayName: string;
  effectiveDate: string;
  /** "draft" until counsel clears it — the UI badges drafts. */
  status: string;
  markdown: string;
}

/** Buyer-supplied signing inputs captured on the agreement stage. */
export interface SignAgreementInput {
  customerLegalName: string;
  signatoryName: string;
  signatoryTitle: string;
  authorityConfirmed: boolean;
}

export interface SignAgreementResult {
  signatureId: number;
  versionLabel: string;
  /** Whether the signed PDF was rendered + stored (false when the render runtime was unavailable). */
  pdfStored: boolean;
}

/** Fetch the filled agreement to review before signing. */
export function fetchAgreementDocument(): Promise<AgreementDocument> {
  return apiClient.saas.json<AgreementDocument>(
    "/api/v1/procurement/agreement/document",
  );
}

/** Record the signed agreement (pins version + hash + variable snapshot + signatory + PDF). */
export function recordAgreementSignature(
  input: SignAgreementInput,
): Promise<SignAgreementResult> {
  return apiClient.saas.json<SignAgreementResult>(
    "/api/v1/procurement/agreement/sign",
    { method: "POST", body: input },
  );
}

/** Fetch a static legal document (eula, sla, subprocessors) by id for in-product viewing. */
export function fetchLegalDocument(docId: string): Promise<AgreementDocument> {
  return apiClient.saas.json<AgreementDocument>(`/api/v1/legal/${docId}`);
}

/** Download the stored, signed enterprise-agreement PDF for the team (post-signing). */
export function fetchSignedAgreementPdf(): Promise<Blob> {
  return apiClient.saas.blob("/api/v1/procurement/agreement/signature/pdf");
}

/** Download the current (unsigned) enterprise-agreement PDF — the document shown at the sign step. */
export function fetchAgreementPdf(): Promise<Blob> {
  return apiClient.saas.blob("/api/v1/procurement/agreement/document/pdf");
}

/**
 * Record a clickwrap consent to a legal document (e.g. the EULA at trial start / quote generation).
 * Best-effort — never block the flow it accompanies on a consent-logging failure.
 */
export function recordLegalConsent(
  documentId: string,
  context: string,
): Promise<void> {
  return apiClient.saas
    .json<void>("/api/v1/legal/consent", {
      method: "POST",
      body: { documentId, context },
    })
    .catch(() => undefined);
}

// ---- Stripe Quote operations (Supabase edge functions) ---------------------
// Java has no Stripe SDK, so issuing/accepting the quote and fetching its PDF run in edge functions
// that own Stripe; they persist results back through SECURITY DEFINER RPCs. The portal invokes them
// directly (same pattern the PAYG checkout uses).

/**
 * Fixture response for an edge function while demo data is on.
 *
 * These calls go out through the Supabase client rather than {@code apiClient}, which is where demo
 * data is normally intercepted — so until this existed they were never mocked. The portal has no
 * service worker: the MSW handlers are matched by URL inside {@link resolveDemoResponse}, so the URL
 * has to be reconstructed here to match what mocks/handlers/procurementSaas.ts registers.
 *
 * This mattered rather more than a missing fixture: issue and accept create a real Stripe Quote and a
 * real committed subscription. With a live session — the normal state when developing against the
 * shared project — pressing "Generate quote" in dev billed nothing but left real objects behind.
 */
async function demoEdgeResponse(
  fn: string,
  quoteId: number,
): Promise<Response | undefined> {
  const base = saasApiBase();
  if (!base) return undefined;
  return resolveDemoResponse(new URL(`${base}/functions/v1/${fn}`), {
    method: "POST",
    body: { quote_id: quoteId },
  });
}

async function invokeEdge<T>(fn: string, quoteId: number): Promise<T> {
  const demo = await demoEdgeResponse(fn, quoteId);
  if (demo) return (await demo.json()) as T;
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
  const demo = await demoEdgeResponse("get-procurement-quote-pdf", quoteId);
  if (demo) return await demo.blob();
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
