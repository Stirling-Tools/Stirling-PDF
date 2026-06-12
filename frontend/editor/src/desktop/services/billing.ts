/**
 * Desktop (Tauri) implementation of the @app/services/billing seam.
 *
 * Routes Stripe session/portal creation through the desktop supabase-js client's
 * functions.invoke with an EXPLICIT Authorization: Bearer header carrying the
 * authService token (the desktop client is configured persistSession:false /
 * autoRefreshToken:false, so it never auto-attaches a JWT). The request is
 * fulfilled by the webview fetch against the Supabase edge functions.
 *
 * The one substantive difference from the web impl is the return URL: web uses
 * window.location.origin, but in the desktop webview that is a localhost dev
 * server / tauri:// origin Stripe can't return to. We pass the app's deep-link
 * scheme (stirlingpdf://, see DESKTOP_DEEP_LINK_CALLBACK) so Stripe can bring
 * the user back into the app after hosted checkout / portal.
 */
import { supabase } from "@app/auth/supabase";
import { authService } from "@app/services/authService";
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
 * Deep-link the SaaS billing backend uses as Stripe's success/cancel/return
 * URL on desktop. Mirrors the stirlingpdf://auth/callback convention used for
 * the OAuth/email flow — the OS routes it back to the running app, which the
 * deep-link handler picks up to refresh the wallet after checkout/portal.
 */
const DESKTOP_BILLING_RETURN_URL = "stirlingpdf://billing/return";

/** Resolve the desktop JWT, throwing a friendly error when signed out. */
async function requireToken(): Promise<string> {
  const token = await authService.getAuthToken();
  if (!token) {
    throw new Error("No authentication token available");
  }
  return token;
}

/**
 * Create a Stripe Checkout Session via the SaaS billing backend — same edge
 * functions and body shapes as the web impl, but routed through Tauri (explicit
 * bearer, deep-link callback).
 *
 * When {@code teamId} is supplied we drive the PAYG
 * {@code create-checkout-session} edge function (subscription with metered
 * overage — see StripeCheckoutPanel); otherwise we use the legacy
 * {@code create-checkout} flow (subscription / credits — see
 * StripeCheckoutSaas). The Tauri webview has no CSP, so embedded checkout works
 * — the moved component mounts the Stripe iframe when a clientSecret comes
 * back, falling back to opening the hosted url in the system browser otherwise.
 */
export async function createCheckoutSession(
  params: CheckoutParams,
): Promise<CheckoutSession> {
  const token = await requireToken();

  if (params.teamId != null) {
    const { data, error } = await supabase.functions.invoke<{
      client_secret?: string;
      url?: string;
      mock?: boolean;
    }>("create-checkout-session", {
      headers: { Authorization: `Bearer ${token}` },
      body: {
        team_id: params.teamId,
        currency: params.currency ?? "gbp",
        success_url: DESKTOP_BILLING_RETURN_URL,
        cancel_url: DESKTOP_BILLING_RETURN_URL,
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

  const { data, error } = await supabase.functions.invoke(
    "create-checkout",
    {
      headers: { Authorization: `Bearer ${token}` },
      body: {
        purchase_type: params.purchaseType,
        ui_mode: params.uiMode ?? "embedded",
        plan: params.plan ?? null,
        credits_pack: params.creditsPack ?? null,
        callback_base_url: DESKTOP_BILLING_RETURN_URL,
        trial_conversion: params.isTrialConversion ?? false,
      },
    },
  );

  if (error) {
    throw new Error(error.message || "Failed to create checkout session");
  }
  if (!data) {
    throw new Error("No data received from server");
  }

  const jsonData = typeof data === "string" ? JSON.parse(data) : data;

  if (jsonData?.clientSecret) {
    return { clientSecret: jsonData.clientSecret as string };
  }
  if (jsonData?.url) {
    return { url: jsonData.url as string };
  }
  throw new Error("No client secret or url received from server");
}

/**
 * Mint a Stripe Customer Portal session. Mirrors the web impl's branching:
 * a teamId routes through the PAYG {@code create-customer-portal-session} edge
 * function; otherwise we fall back to the legacy {@code manage-billing} portal.
 * Both go through the desktop supabase client with an explicit bearer and use
 * the deep-link return URL.
 */
export async function createPortalSession(
  params?: PortalParams,
): Promise<PortalSession> {
  const token = await requireToken();
  const teamId = params?.teamId;

  if (teamId != null) {
    const { data, error } = await supabase.functions.invoke<{
      url?: string;
      error?: string;
    }>("create-customer-portal-session", {
      headers: { Authorization: `Bearer ${token}` },
      body: { team_id: teamId, return_url: DESKTOP_BILLING_RETURN_URL },
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
    headers: { Authorization: `Bearer ${token}` },
    body: { return_url: DESKTOP_BILLING_RETURN_URL },
  });
  if (error) {
    throw error;
  }
  if (!data?.url) {
    throw new Error(data?.error ?? "Portal session response missing url");
  }
  return { url: data.url };
}

/**
 * The Stripe publishable key for embedded checkout. Desktop reads the same
 * build-time {@code VITE_STRIPE_PUBLISHABLE_KEY} the web build uses — it is
 * baked into the Tauri bundle at build time. import.meta.env is permitted in
 * the desktop leaf (the ban only applies to cloud/).
 */
export function getStripePublishableKey(): string {
  return import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "";
}
