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
  mock?: boolean;
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
  quoteNumber: string;
  status: string;
  validUntil: string;
}

interface BundleQuoteRow {
  quote_id: number;
  quote_number: string;
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
    quoteNumber: row.quote_number,
    status: row.status,
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
  mock: boolean;
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
    mock: Boolean(res.mock) || clientSecret?.startsWith("cs_mock_") === true,
  };
}

interface BundleCheckoutRequest {
  teamId: number;
  successUrl: string;
  cancelUrl: string;
  /**
   * Quote path (preferred): check out against a persisted quote — the edge fn reads its pool +
   * consent and flips it to paid on the webhook. Supersedes the inline units/consent fields.
   */
  quoteId?: number;
  /** Direct path (fallback): purchased capacity (size-scaled run-credits) sent inline. */
  units?: number;
  /** Direct path: affirmative consent to the prepaid→metered auto-transition (ARL/EULA §7.2). */
  consented?: boolean;
  /** Direct path: EULA version the consent is recorded against. */
  eulaVersion?: string;
}

/**
 * Mint a one-time ({@code mode:payment}) Stripe Checkout session for a prepaid
 * bundle, via the {@code create-payg-bundle-checkout} edge function. Prefer the
 * {@code quoteId} path (the edge fn reads the pool + consent off the persisted
 * quote and settles it on payment); the inline {@code units}/consent path remains
 * for callers without a quote. Either way the pool is credited on the Stripe
 * webhook, never here. Defaults to embedded Checkout ({@code clientSecret}).
 */
export async function createBundleCheckoutSession(
  req: BundleCheckoutRequest,
): Promise<CheckoutSession> {
  const res = await invoke<CheckoutResponse>("create-payg-bundle-checkout", {
    team_id: req.teamId,
    success_url: req.successUrl,
    cancel_url: req.cancelUrl,
    ...(req.quoteId != null
      ? { quote_id: req.quoteId }
      : {
          units: req.units,
          consented: req.consented,
          eula_version: req.eulaVersion,
        }),
    // Keep the modal open on completion so it can finalise + refetch the wallet
    // (a redirect would reload the page and skip Stripe's onComplete).
    redirect_on_completion: "never",
  });
  const clientSecret = res.client_secret ?? null;
  const redirectUrl = res.url ?? null;
  if (!clientSecret && !redirectUrl) {
    throw new StripeFunctionError(
      res.error ??
        "create-payg-bundle-checkout returned neither client_secret nor URL",
    );
  }
  return {
    clientSecret,
    redirectUrl,
    alreadySubscribed: false,
    mock: Boolean(res.mock) || clientSecret?.startsWith("cs_mock_") === true,
  };
}

interface BundleInvoiceRequest {
  teamId: number;
  /** The persisted quote to invoice. */
  quoteId: number;
  /** Optional PO number to print on the invoice for the buyer's AP. */
  poNumber?: string;
  /** Net terms; defaults to 30 on the server. */
  daysUntilDue?: number;
}

/** A raised Stripe invoice — {@code create-payg-bundle-invoice} result. */
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
 * Raise a Stripe INVOICE for a prepaid-bundle quote — the bank-transfer / PO route (net terms), via
 * {@code create-payg-bundle-invoice}. Capacity is credited only when the invoice is PAID (the webhook),
 * never here. Idempotent per quote server-side. Returns the hosted invoice URL to send the buyer.
 */
export async function createBundleInvoice(
  req: BundleInvoiceRequest,
): Promise<BundleInvoice> {
  const res = await invoke<BundleInvoiceResponse>(
    "create-payg-bundle-invoice",
    {
      team_id: req.teamId,
      quote_id: req.quoteId,
      ...(req.poNumber ? { po_number: req.poNumber } : {}),
      ...(req.daysUntilDue != null ? { days_until_due: req.daysUntilDue } : {}),
    },
  );
  if (!res.success || !res.invoice_id) {
    throw new StripeFunctionError(
      res.error ?? "create-payg-bundle-invoice failed",
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
