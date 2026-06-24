import { getSupabaseClient } from "@shared/auth/supabase/supabaseClient";
import { ensureSaasSupabase } from "@portal/auth/saasSupabase";

/**
 * Stripe checkout + portal sessions, minted via the SaaS Supabase edge
 * functions (no new Java endpoints). Same pattern the SaaS web app uses for
 * its Plan page — `supabase.functions.invoke` carries the admin's JWT
 * automatically, and the edge functions resolve the team via the
 * `payg_get_checkout_context` RPC.
 */

export class StripeFunctionError extends Error {
  constructor(message: string, public readonly code?: string) {
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

/** Checkout response: either a new Checkout URL or a portal URL if already subscribed. */
interface CheckoutResponse {
  success: boolean;
  checkout_url?: string;
  portal_url?: string;
  already_subscribed?: boolean;
  error?: string;
}

interface PortalResponse {
  success: boolean;
  url?: string;
  error?: string;
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  ensureSaasSupabase();
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new StripeFunctionError(
      "SaaS Supabase not configured — set VITE_SAAS_SUPABASE_URL.",
      "unconfigured",
    );
  }
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    throw new StripeFunctionError(error.message ?? `Edge function ${name} failed`);
  }
  if (data == null) {
    throw new StripeFunctionError(`Edge function ${name} returned no data`);
  }
  return data;
}

/**
 * Mint a Stripe Checkout session for PAYG subscription. Returns the URL the
 * browser should redirect to: usually a Checkout URL, but if the team is
 * already subscribed the edge function short-circuits to a Customer Portal URL
 * (so the click still does something sensible). After Checkout completes, the
 * Stripe webhook flips the team to subscribed and the next fetchWallet picks
 * it up.
 */
export async function createCheckoutSession(
  req: CheckoutSessionRequest,
): Promise<{ url: string; alreadySubscribed: boolean }> {
  const res = await invoke<CheckoutResponse>("create-checkout-session", {
    team_id: req.teamId,
    currency: req.currency ?? "usd",
    success_url: req.successUrl,
    cancel_url: req.cancelUrl,
    ...(req.billingOwnerEmail
      ? { billing_owner_email: req.billingOwnerEmail }
      : {}),
  });
  if (!res.success) {
    throw new StripeFunctionError(res.error ?? "create-checkout-session failed");
  }
  const url = res.checkout_url ?? res.portal_url;
  if (!url) {
    throw new StripeFunctionError("create-checkout-session returned no URL");
  }
  return { url, alreadySubscribed: Boolean(res.already_subscribed) };
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
