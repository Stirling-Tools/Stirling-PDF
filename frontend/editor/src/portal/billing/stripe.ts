import type { Stripe } from "@stripe/stripe-js";
import { getSupabaseClient } from "@app/auth/supabase/supabaseClient";
import { ensureSaasSupabase } from "@portal/auth/saasSupabase";

/**
 * Stripe checkout + portal sessions, minted via the SaaS Supabase edge
 * functions (no new Java endpoints). Same pattern the SaaS web app uses for
 * its Plan page — `supabase.functions.invoke` carries the admin's JWT
 * automatically, and the edge functions resolve the team via the
 * `payg_get_checkout_context` RPC.
 */

export class StripeFunctionError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "StripeFunctionError";
  }
}

/** Currencies the SaaS PAYG offering supports. Default for new checkouts is "usd". */
export type SaasCurrency = "usd" | "eur" | "gbp";

interface CheckoutSessionRequest {
  teamId: number;
  /** Where Stripe redirects on success — typically the portal billing page. */
  successUrl: string;
  /** Where Stripe redirects on cancel/close. */
  cancelUrl: string;
  /** ISO 4217 lower-case. Defaults to "usd"; portal uses the wallet's currency when set. */
  currency?: SaasCurrency;
  /** Optional prefill for the Stripe Checkout email field. */
  billingOwnerEmail?: string;
}

interface PortalSessionRequest {
  teamId: number;
  returnUrl: string;
}

/**
 * Checkout response shape. The edge function defaults to embedded Stripe
 * Checkout (returns {@code client_secret}); it can also return:
 *   - {@code portal_url} + {@code already_subscribed: true} when the team is
 *     already on PAYG (short-circuit so the click still does something useful)
 *   - {@code url} alongside or instead of {@code client_secret} for hosted /
 *     redirect-mode flows (rare; embedded is the default for the SaaS UX).
 */
interface CheckoutResponse {
  success: boolean;
  client_secret?: string;
  url?: string;
  portal_url?: string;
  already_subscribed?: boolean;
  error?: string;
}

interface PortalResponse {
  success: boolean;
  url?: string;
  error?: string;
}

async function invoke<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  ensureSaasSupabase();
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new StripeFunctionError(
      "SaaS Supabase not configured — set VITE_SUPABASE_URL.",
      "unconfigured",
    );
  }
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    throw new StripeFunctionError(
      error.message ?? `Edge function ${name} failed`,
    );
  }
  if (data == null) {
    throw new StripeFunctionError(`Edge function ${name} returned no data`);
  }
  return data;
}

/** Call a SECURITY DEFINER public.* RPC with the admin's JWT (same client as {@link invoke}). */
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  ensureSaasSupabase();
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new StripeFunctionError(
      "SaaS Supabase not configured — set VITE_SUPABASE_URL.",
      "unconfigured",
    );
  }
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    throw new StripeFunctionError(
      error.message ?? `RPC ${fn} failed`,
      (error as { code?: string }).code,
    );
  }
  return data as T;
}

/** Inputs to {@link upsertBundleQuote} — the sized config + computed figures. */
export interface BundleQuoteInput {
  teamId: number;
  users: number;
  posturePolicies: number;
  sizeMult: number;
  pipelineMult: number;
  provisionedMonthlyVolume: number;
  /** Size-folded run-credits = the Stripe line quantity when this quote is paid. */
  poolCredits: number;
  /** Discounted total in minor units; null when the per-run rate is unknown. */
  priceMinor: number | null;
  currency: string;
  /** Affirmative consent to the prepaid→metered auto-transition (ARL/EULA §7.2). */
  consented: boolean;
  eulaVersion: string;
  /** When set, edits that existing (unpaid) quote instead of creating a new one. */
  quoteId?: number;
}

/** A persisted prepaid-bundle quote (proforma) — {@code payg_upsert_bundle_quote} result. */
export interface BundleQuote {
  quoteId: number;
  status: string;
  validUntil: string;
}

interface BundleQuoteRow {
  quote_id: number;
  status: string;
  valid_until: string;
}

/**
 * Create (or edit an unpaid) prepaid-bundle quote via {@code payg_upsert_bundle_quote}. LEADER-gated
 * server-side. The quote persists the sized config + figures so the buyer can download a numbered
 * proforma to share for approval and check out against it later; capacity is still credited only on
 * payment (the webhook), never here.
 */
export async function upsertBundleQuote(
  input: BundleQuoteInput,
): Promise<BundleQuote> {
  const rows = await rpc<BundleQuoteRow[]>("payg_upsert_bundle_quote", {
    p_team_id: input.teamId,
    p_posture_policies: input.posturePolicies,
    p_size_mult: input.sizeMult,
    p_pipeline_mult: input.pipelineMult,
    p_pool_credits: input.poolCredits,
    p_users: input.users,
    p_provisioned_monthly_volume: input.provisionedMonthlyVolume,
    p_price_minor: input.priceMinor,
    p_currency: input.currency,
    p_consented: input.consented,
    p_eula_version: input.eulaVersion,
    ...(input.quoteId != null ? { p_quote_id: input.quoteId } : {}),
  });
  const row = rows?.[0];
  if (!row) {
    throw new StripeFunctionError("payg_upsert_bundle_quote returned no row");
  }
  return {
    quoteId: row.quote_id,
    status: row.status,
    validUntil: row.valid_until,
  };
}

/** A team's latest open bundle quote — {@code payg_get_latest_bundle_quote} result, for resume. */
export interface LatestBundleQuote {
  quoteId: number;
  users: number | null;
  posturePolicies: number;
  sizeMult: number;
  pipelineMult: number;
  poolCredits: number;
  priceMinor: number | null;
  currency: string | null;
  consentedAt: string | null;
  stripeQuoteId: string | null;
  stripeQuoteNumber: string | null;
  /** The generated invoice id, set once the quote is accepted — lets the modal resume to the pay step. */
  stripeRef: string | null;
  validUntil: string;
}

interface LatestBundleQuoteRow {
  quote_id: number;
  users: number | null;
  posture_policies: number;
  size_mult: number | string;
  pipeline_mult: number;
  pool_credits: number;
  price_minor: number | null;
  currency: string | null;
  consented_at: string | null;
  stripe_quote_id: string | null;
  stripe_quote_number: string | null;
  stripe_ref: string | null;
  valid_until: string;
}

/**
 * Fetch the team's most-recent OPEN (draft/issued, unexpired) bundle quote via
 * {@code payg_get_latest_bundle_quote}, so the modal can resume it instead of minting a fresh Stripe
 * quote on every reopen. Returns null when the team has none.
 */
export async function getLatestBundleQuote(
  teamId: number,
): Promise<LatestBundleQuote | null> {
  const rows = await rpc<LatestBundleQuoteRow[]>(
    "payg_get_latest_bundle_quote",
    { p_team_id: teamId },
  );
  const row = rows?.[0];
  if (!row) return null;
  return {
    quoteId: row.quote_id,
    users: row.users,
    posturePolicies: row.posture_policies,
    sizeMult: Number(row.size_mult),
    pipelineMult: row.pipeline_mult,
    poolCredits: row.pool_credits,
    priceMinor: row.price_minor,
    currency: row.currency,
    consentedAt: row.consented_at,
    stripeQuoteId: row.stripe_quote_id,
    stripeQuoteNumber: row.stripe_quote_number,
    stripeRef: row.stripe_ref,
    validUntil: row.valid_until,
  };
}

/**
 * Result of {@link createCheckoutSession}. Exactly ONE of {@code clientSecret}
 * or {@code redirectUrl} is set: clientSecret drives embedded Stripe Checkout
 * (the default UX, matching the SaaS web app); redirectUrl is used for the
 * already-subscribed short-circuit (portal URL) or any hosted-mode fallback.
 */
export interface CheckoutSession {
  clientSecret: string | null;
  redirectUrl: string | null;
  alreadySubscribed: boolean;
}

/**
 * Mint a Stripe Checkout session for PAYG subscription. Defaults to embedded
 * Checkout (returns {@code clientSecret}) so the portal can mount
 * &lt;EmbeddedCheckoutProvider&gt; inline. If the team is already subscribed the
 * edge function short-circuits to a Customer Portal URL — surfaced as
 * {@code redirectUrl} + {@code alreadySubscribed=true} so the caller can open it
 * in a new tab instead of trying to mount a checkout iframe with no secret.
 */
export async function createCheckoutSession(
  req: CheckoutSessionRequest,
): Promise<CheckoutSession> {
  const res = await invoke<CheckoutResponse>("create-checkout-session", {
    team_id: req.teamId,
    currency: req.currency ?? "usd",
    success_url: req.successUrl,
    cancel_url: req.cancelUrl,
    // The portal drives an in-page onComplete handler (the checkout modal stays open to
    // finalise activation + nudge the linked instance), so tell the edge function not to
    // redirect on completion. A redirect would reload the page, skip that finalize step, and
    // make Stripe ignore onComplete entirely (console warns "redirect_on_completion: always").
    redirect_on_completion: "never",
    ...(req.billingOwnerEmail
      ? { billing_owner_email: req.billingOwnerEmail }
      : {}),
  });
  if (!res.success) {
    throw new StripeFunctionError(
      res.error ?? "create-checkout-session failed",
    );
  }
  const alreadySubscribed = Boolean(res.already_subscribed);
  const redirectUrl = alreadySubscribed
    ? (res.portal_url ?? null)
    : (res.url ?? null);
  const clientSecret = alreadySubscribed ? null : (res.client_secret ?? null);
  if (!clientSecret && !redirectUrl) {
    throw new StripeFunctionError(
      "create-checkout-session returned neither client_secret nor URL",
    );
  }
  return {
    clientSecret,
    redirectUrl,
    alreadySubscribed,
  };
}

/** Result of {@link createBundleStripeQuote} — the Stripe-issued quote handles. */
export interface BundleStripeQuote {
  stripeQuoteId: string;
  stripeQuoteNumber: string | null;
}

interface BundleStripeQuoteRequest {
  teamId: number;
  /** The persisted quote row (from {@link upsertBundleQuote}) to turn into a Stripe quote. */
  quoteId: number;
  /** Optional PO number printed on the quote + carried to the eventual invoice. */
  poNumber?: string;
  /** Net terms for the eventual invoice; defaults to 30 on the server. */
  daysUntilDue?: number;
}

interface BundleStripeQuoteResponse {
  success?: boolean;
  stripe_quote_id?: string;
  stripe_quote_number?: string | null;
  error?: string;
}

/**
 * Create + finalize the Stripe QUOTE backing a persisted quote row, via {@code create-payg-bundle-quote}.
 * The customer-facing quote number + PDF are Stripe's. On edit the server cancels the prior Stripe quote
 * and issues a new one. Capacity is credited only when the accepted quote's invoice is PAID (the webhook).
 */
export async function createBundleStripeQuote(
  req: BundleStripeQuoteRequest,
): Promise<BundleStripeQuote> {
  const res = await invoke<BundleStripeQuoteResponse>(
    "create-payg-bundle-quote",
    {
      team_id: req.teamId,
      quote_id: req.quoteId,
      ...(req.poNumber ? { po_number: req.poNumber } : {}),
      ...(req.daysUntilDue != null ? { days_until_due: req.daysUntilDue } : {}),
    },
  );
  if (!res.success || !res.stripe_quote_id) {
    throw new StripeFunctionError(
      res.error ?? "create-payg-bundle-quote failed",
    );
  }
  return {
    stripeQuoteId: res.stripe_quote_id,
    stripeQuoteNumber: res.stripe_quote_number ?? null,
  };
}

/** A raised Stripe invoice — the {@code accept-payg-bundle-quote} result. */
export interface BundleInvoice {
  invoiceId: string;
  /** Stripe-hosted page where the buyer pays / downloads the invoice. */
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  status: string | null;
}

interface BundleInvoiceResponse {
  success?: boolean;
  invoice_id?: string;
  hosted_invoice_url?: string | null;
  invoice_pdf?: string | null;
  status?: string | null;
  error?: string;
}

/**
 * Accept the Stripe quote for a persisted quote row, via {@code accept-payg-bundle-quote}. Acceptance
 * generates the net-terms invoice as a DRAFT (auto_advance off) and returns the hosted URL; the
 * payment step ({@link finalizeBundleInvoice}) stamps the recipient + PO and finalizes it. Payable by
 * card on the hosted page, or by bank transfer / PO. Capacity is credited only on invoice.paid.
 */
export async function acceptBundleStripeQuote(req: {
  teamId: number;
  quoteId: number;
}): Promise<BundleInvoice> {
  const res = await invoke<BundleInvoiceResponse>("accept-payg-bundle-quote", {
    team_id: req.teamId,
    quote_id: req.quoteId,
  });
  if (!res.success || !res.invoice_id) {
    throw new StripeFunctionError(
      res.error ?? "accept-payg-bundle-quote failed",
    );
  }
  return {
    invoiceId: res.invoice_id,
    hostedInvoiceUrl: res.hosted_invoice_url ?? null,
    invoicePdf: res.invoice_pdf ?? null,
    status: res.status ?? null,
  };
}

/**
 * Finalize the accepted bundle invoice (stamping an optional PO), via {@code finalize-payg-bundle-invoice}.
 * Returns the hosted checkout URL + PDF. Called by both Download-invoice and Pay-online; idempotent
 * server-side (an already-finalized invoice comes back as-is, PO locked).
 */
export async function finalizeBundleInvoice(req: {
  teamId: number;
  quoteId: number;
  poNumber?: string;
  /** Optional company — becomes the invoice bill-to name (no length cap). */
  companyName?: string;
  /** Required account-holder name — the bill-to when there's no company, else an "Account holder" field. */
  accountName?: string;
}): Promise<BundleInvoice> {
  const res = await invoke<BundleInvoiceResponse>(
    "finalize-payg-bundle-invoice",
    {
      team_id: req.teamId,
      quote_id: req.quoteId,
      ...(req.poNumber ? { po_number: req.poNumber } : {}),
      ...(req.companyName ? { company_name: req.companyName } : {}),
      ...(req.accountName ? { account_name: req.accountName } : {}),
    },
  );
  if (!res.success || !res.invoice_id) {
    throw new StripeFunctionError(
      res.error ?? "finalize-payg-bundle-invoice failed",
    );
  }
  return {
    invoiceId: res.invoice_id,
    hostedInvoiceUrl: res.hosted_invoice_url ?? null,
    invoicePdf: res.invoice_pdf ?? null,
    status: res.status ?? null,
  };
}

/**
 * Cancel an unpaid prepaid-bundle purchase via {@code cancel-payg-bundle-quote}: the edge fn voids the
 * invoice (delete if draft, void if finalized), best-effort cancels the Stripe quote, and voids the quote
 * row so the buyer can start over. Nothing was charged (capacity is credited on invoice.paid), so there's
 * no refund. Throws a StripeFunctionError on failure (e.g. {@code invoice_already_paid}).
 */
export async function cancelBundleQuote(req: {
  teamId: number;
  quoteId: number;
}): Promise<void> {
  const res = await invoke<{ success?: boolean; error?: string }>(
    "cancel-payg-bundle-quote",
    { team_id: req.teamId, quote_id: req.quoteId },
  );
  if (!res.success) {
    throw new StripeFunctionError(
      res.error ?? "cancel-payg-bundle-quote failed",
    );
  }
}

/**
 * Fetch the Stripe-rendered quote PDF for a persisted quote, via the {@code create-payg-bundle-quote}
 * GET route (streams application/pdf). Returns a Blob the caller can object-URL for download.
 */
export async function fetchBundleQuotePdf(quoteId: number): Promise<Blob> {
  ensureSaasSupabase();
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new StripeFunctionError(
      "SaaS Supabase not configured — set VITE_SUPABASE_URL.",
      "unconfigured",
    );
  }
  const { data, error } = await supabase.functions.invoke<Blob>(
    `create-payg-bundle-quote?quote_id=${quoteId}`,
    { method: "GET" },
  );
  if (error) {
    throw new StripeFunctionError(error.message ?? "quote PDF fetch failed");
  }
  if (!(data instanceof Blob)) {
    throw new StripeFunctionError("quote PDF response was not a file");
  }
  return data;
}

/**
 * {@code VITE_STRIPE_PUBLISHABLE_KEY} — the Stripe pk used by embedded Checkout. Coalesces to "" when
 * unset so the declared `string` return type is honest (Vite substitutes `undefined` for a missing
 * env var); callers guard with a falsy check.
 */
export function getStripePublishableKey(): string {
  return import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "";
}

// Process-wide memoized Stripe.js loader, shared by the embedded-checkout modals so the SDK promise
// is created once rather than per-modal. loadStripe is dynamically imported so its chunk only loads
// when a checkout modal reaches its payment step.
let stripePromise: Promise<Stripe | null> | null = null;
export function loadStripeOnce(pk: string): Promise<Stripe | null> {
  if (stripePromise === null) {
    stripePromise = import("@stripe/stripe-js").then((m) => m.loadStripe(pk));
  }
  return stripePromise;
}

/**
 * Mint a Stripe Customer Portal session. The admin can manage their card,
 * view invoices, and cancel from Stripe's hosted UI. The edge function returns
 * 404 with {@code team_not_subscribed} if called for a free team — surfaced
 * here as a StripeFunctionError the caller can toast.
 */
export async function createPortalSession(
  req: PortalSessionRequest,
): Promise<string> {
  const res = await invoke<PortalResponse>("create-customer-portal-session", {
    team_id: req.teamId,
    return_url: req.returnUrl,
  });
  if (!res.success || !res.url) {
    throw new StripeFunctionError(
      res.error ?? "create-customer-portal-session failed",
    );
  }
  return res.url;
}
