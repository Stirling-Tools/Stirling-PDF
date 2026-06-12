/**
 * SaaS (web) implementation of the @app/services/billing seam.
 *
 * Mirrors the existing web billing transport: Stripe-touching work lives in
 * Supabase edge functions, invoked directly through the web supabase-js client
 * (which attaches the signed-in user's session JWT automatically). The
 * callback/return URL is the browser origin — exactly what StripeCheckoutSaas
 * and useWallet.openPortal pass today. Extracted here without changing those
 * components' behaviour; the components are migrated to consume this seam in T8.
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
  PurchaseType,
  PlanID,
  CreditsPack,
} from "@cloud/services/billing";

/**
 * Create a Stripe Checkout Session via the SaaS billing backend. The web
 * supabase client attaches the user's JWT automatically.
 *
 * When {@code teamId} is supplied we drive the PAYG
 * {@code create-checkout-session} edge function (subscription with metered
 * overage — see StripeCheckoutPanel); otherwise we use the legacy
 * {@code create-checkout} flow (subscription / credits — see
 * StripeCheckoutSaas). Both use the browser origin / current location as the
 * return URL so Stripe returns the user to the current site.
 */
export async function createCheckoutSession(
  params: CheckoutParams,
): Promise<CheckoutSession> {
  if (params.teamId != null) {
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
        mock:
          Boolean(data.mock) || data.client_secret.startsWith("cs_mock_"),
      };
    }
    if (data?.url) {
      return { url: data.url };
    }
    throw new Error("Edge function returned no client_secret");
  }

  const { data, error } = await supabase.functions.invoke("create-checkout", {
    body: {
      purchase_type: params.purchaseType,
      ui_mode: params.uiMode ?? "embedded",
      plan: params.plan ?? null,
      credits_pack: params.creditsPack ?? null,
      callback_base_url: window.location.origin,
      trial_conversion: params.isTrialConversion ?? false,
    },
  });

  if (error) {
    throw new Error(error.message || "Failed to create checkout session");
  }
  if (!data) {
    throw new Error("No data received from server");
  }

  const jsonData = typeof data === "string" ? JSON.parse(data) : data;

  // Embedded checkout returns a clientSecret; hosted checkout returns a url.
  if (jsonData?.clientSecret) {
    return { clientSecret: jsonData.clientSecret as string };
  }
  if (jsonData?.url) {
    return { url: jsonData.url as string };
  }
  throw new Error("No client secret or url received from server");
}

/**
 * The Stripe publishable key for embedded checkout. On the web this is the
 * build-time {@code VITE_STRIPE_PUBLISHABLE_KEY} — the same source
 * StripeCheckoutSaas / StripeCheckoutPanel read before the seam extraction.
 */
export function getStripePublishableKey(): string {
  return import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "";
}

/**
 * Mint a Stripe Customer Portal session. When a teamId is supplied we use the
 * PAYG {@code create-customer-portal-session} edge function (same call as
 * useWallet.openPortal — its RPC enforces team membership); otherwise we fall
 * back to the legacy {@code manage-billing} portal, which derives the team
 * from the JWT. return_url is the current location so Stripe brings the user
 * back to this page on close.
 */
export async function createPortalSession(
  params?: PortalParams,
): Promise<PortalSession> {
  const returnUrl = window.location.href;
  const teamId = params?.teamId;

  if (teamId != null) {
    const { data, error } = await supabase.functions.invoke<{
      url?: string;
      error?: string;
    }>("create-customer-portal-session", {
      body: { team_id: teamId, return_url: returnUrl },
    });
    if (error) {
      throw error;
    }
    if (!data?.url) {
      throw new Error(data?.error ?? "Portal session response missing url");
    }
    return { url: data.url };
  }

  const { data, error } = await supabase.functions.invoke<{
    url?: string;
    error?: string;
  }>("manage-billing", {
    body: { return_url: returnUrl },
  });
  if (error) {
    throw error;
  }
  if (!data?.url) {
    throw new Error(data?.error ?? "Portal session response missing url");
  }
  return { url: data.url };
}
