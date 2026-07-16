/**
 * SaaS (web) implementation of the @app/services/billing seam.
 *
 * Stripe-touching work lives in Supabase edge functions, invoked through the web
 * supabase-js client (which attaches the signed-in user's session JWT
 * automatically). The return URL is the browser origin.
 */
import { supabase } from "@app/auth/supabase";
import type {
  CheckoutParams,
  CheckoutSession,
  PortalParams,
  PortalSession,
} from "@cloud/services/billing";

export type {
  CheckoutParams,
  CheckoutSession,
  PortalParams,
  PortalSession,
} from "@cloud/services/billing";

/**
 * Create a Stripe Checkout Session for the PAYG subscription via the
 * {@code create-checkout-session} edge function (see StripeCheckoutPanel). The
 * function runs outside Spring Security, so it takes the team id directly.
 */
export async function createCheckoutSession(
  params: CheckoutParams,
): Promise<CheckoutSession> {
  const returnUrl = window.location.href;
  const { data, error } = await supabase.functions.invoke<{
    client_secret?: string;
    url?: string;
    mock?: boolean;
  }>("create-checkout-session", {
    body: {
      team_id: params.teamId,
      currency: params.currency ?? "gbp",
      success_url: returnUrl,
      cancel_url: returnUrl,
      ...(params.billingOwnerEmail
        ? { billing_owner_email: params.billingOwnerEmail }
        : {}),
    },
  });

  if (error) {
    throw error;
  }
  if (data?.client_secret) {
    return {
      clientSecret: data.client_secret,
      mock: Boolean(data.mock) || data.client_secret.startsWith("cs_mock_"),
    };
  }
  if (data?.url) {
    return { url: data.url };
  }
  throw new Error("Edge function returned no client_secret");
}

/**
 * The Stripe publishable key for embedded checkout. On the web this is the
 * build-time {@code VITE_STRIPE_PUBLISHABLE_KEY}.
 */
export function getStripePublishableKey(): string {
  return import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "";
}

/**
 * Mint a Stripe Customer Portal session via the PAYG
 * {@code create-customer-portal-session} edge function (its RPC enforces team
 * membership). return_url is the current location so Stripe brings the user
 * back to this page on close.
 */
export async function createPortalSession(
  params: PortalParams,
): Promise<PortalSession> {
  const { data, error } = await supabase.functions.invoke<{
    url?: string;
    error?: string;
  }>("create-customer-portal-session", {
    body: { team_id: params.teamId, return_url: window.location.href },
  });
  if (error) {
    throw error;
  }
  if (!data?.url) {
    throw new Error(data?.error ?? "Portal session response missing url");
  }
  return { url: data.url };
}
