import { apiClient } from "@portal/api/http";
import { getSupabaseClient } from "@shared/auth/supabase/supabaseClient";
import type { Tier } from "@portal/contexts/TierContext";
import type {
  DealStage,
  DocAction,
  ProcurementResponse,
} from "@portal/mocks/procurement";

export type {
  Deal,
  DealStage,
  DocAction,
  DocStatus,
  JourneyStep,
  LedgerDoc,
  LedgerGroup,
  ProcurementResponse,
  QuoteInfo,
  SolutionsEngineer,
  SupportingCategory,
  SupportingGroup,
  TrialInfo,
} from "@portal/mocks/procurement";
export { JOURNEY } from "@portal/mocks/procurement";

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
  lineItems: QuoteLineItem[];
  validUntil: string | null;
  /** The Stripe Quote id once issued; null while still a local draft. */
  stripeQuoteId: string | null;
  /** Hosted Stripe invoice URL, present once the quote is accepted and the subscription invoice exists. */
  invoiceUrl: string | null;
  /** The inputs this quote was priced from, so the builder can seed itself on re-edit. */
  config: QuoteConfigInput;
}

/** Outcome of accepting an issued quote: Stripe creates the subscription + first invoice. */
export interface AcceptResult {
  status: string;
  subscriptionId: string | null;
  invoiceUrl: string | null;
}

/** One shape for every state; an unstarted procurement has {@link ProcurementSnapshot.dealId} null. */
export interface ProcurementSnapshot {
  dealId: number | null;
  stage: DealStage | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialExtensionsUsed: number;
  licensed: boolean;
  latestQuote: QuoteResult | null;
}

export interface QuoteConfigInput {
  volume: number;
  users: number;
  deployment: string;
  termYears: number;
  serviceLevel: string;
  indemnification: boolean;
  training: boolean;
  qbr: boolean;
  currency: string;
}

const BASE = "/api/v1/procurement";

export function fetchSnapshot(): Promise<ProcurementSnapshot> {
  return apiClient.saas.json<ProcurementSnapshot>(BASE);
}

export function estimateVolume(
  users: number,
): Promise<{ annualVolume: number }> {
  return apiClient.saas.json<{ annualVolume: number }>(
    `${BASE}/estimate?users=${encodeURIComponent(users)}`,
  );
}

export function startTrial(): Promise<ProcurementSnapshot> {
  return apiClient.saas.json<ProcurementSnapshot>(`${BASE}/trial/start`, {
    method: "POST",
  });
}

export function extendTrial(): Promise<ProcurementSnapshot> {
  return apiClient.saas.json<ProcurementSnapshot>(`${BASE}/trial/extend`, {
    method: "POST",
  });
}

/** Price a config server-side and persist it as a local DRAFT (no Stripe object yet). */
export function buildQuote(cfg: QuoteConfigInput): Promise<QuoteResult> {
  return apiClient.saas.json<QuoteResult>(`${BASE}/quote`, {
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

/** Reset the team's procurement (delete the deal) and get the fresh empty snapshot. */
export function resetProcurement(): Promise<ProcurementSnapshot> {
  return apiClient.saas.json<ProcurementSnapshot>(`${BASE}/reset`, {
    method: "POST",
  });
}
