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
      "SaaS Supabase not configured — set VITE_SAAS_SUPABASE_URL.",
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

/** {@code VITE_STRIPE_PUBLISHABLE_KEY} — the Stripe pk used by embedded Checkout. */
export function getStripePublishableKey(): string {
  return import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
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
