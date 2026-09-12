/**
 * Team-plan checkout, minted as the buyer's Stirling account.
 *
 * A Team plan is only ever sold to a SaaS team lead, and the purchase credits their cloud team, so
 * the session has to be created by an authenticated account rather than by an installation. Same
 * shape the portal's billing client uses: `supabase.functions.invoke` attaches the signed-in JWT,
 * and the edge function resolves the buyer, their Stripe customer and their email from it.
 *
 * The client here is the one the checkout modal already used. It is configured from the same
 * VITE_SUPABASE_* project as the shared client the account-link sign-in writes its session to, and
 * supabase-js keys persisted sessions by project, so it sees that session. It lives in this layer
 * rather than the portal's because the checkout modal is bundled by the desktop build too, and the
 * desktop cascade does not carry `@portal/*`.
 */
import { supabase, isSupabaseConfigured } from "@app/services/supabaseClient";

/**
 * A Team-plan checkout, sized in user blocks rather than seats.
 *
 * {@link uiMode} follows the instance's own protocol: Stripe's embedded iframe needs a secure
 * context, so a plain-HTTP instance asks for `"hosted"` and supplies the two return URLs.
 */
export interface ServerPlanCheckoutRequest {
  /** Stripe price lookup key for the chosen period, e.g. `selfhosted:server:yearly`. */
  lookupKey: string;
  /** User blocks being bought. One block is the Team plan's user allowance. */
  serverQuantity: number;
  /** Adds the adjustable per-seat line Enterprise is priced on; Team leaves it off. */
  requiresSeats?: boolean;
  seatCount?: number;
  /** This instance's fingerprint, carried as Stripe metadata so a purchase can be traced to it. */
  installationId?: string;
  /** A legacy licence the buyer is upgrading from. Metadata only — this lane issues no licence. */
  currentLicenseKey?: string;
  uiMode: "embedded" | "hosted";
  /** Required for `uiMode: "hosted"`; Stripe redirects here after payment. */
  successUrl?: string;
  cancelUrl?: string;
}

/**
 * Result of {@link createServerPlanCheckoutSession}. `clientSecret` drives embedded Checkout;
 * `url` is Stripe's own page, returned for `uiMode: "hosted"`.
 */
export interface ServerPlanCheckoutSession {
  clientSecret: string | null;
  url: string | null;
  sessionId: string | null;
}

interface CheckoutResponse {
  clientSecret?: string | null;
  sessionId?: string | null;
  url?: string | null;
  error?: string;
}

/**
 * Mint the Stripe Checkout session for a Team-plan purchase.
 *
 * Deliberately omits `self_hosted`, which is what selects the edge function's other lane: that one
 * identifies the buyer by an email typed into the form, bills a Stripe customer keyed on it, and
 * has the webhook mint a Keygen licence. Omitting it puts the purchase on the authenticated lane,
 * where the buyer is the JWT's account and the subscription credits the cloud team they lead.
 * Nothing here passes an email for the same reason: the edge function reads it from that account,
 * so a browser-autofilled value cannot bill a different customer.
 *
 * @throws Error when no Stirling account is signed in — checked before invoking, because the edge
 *     function answers a bare "Unauthorized" that tells the buyer nothing about what to do next.
 */
export async function createServerPlanCheckoutSession(
  request: ServerPlanCheckoutRequest,
): Promise<ServerPlanCheckoutSession> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured. Checkout is not available.");
  }

  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error(
      "Sign in to the Stirling account you want to buy Team for, then try again.",
    );
  }

  const { data, error } = await supabase.functions.invoke<CheckoutResponse>(
    "create-checkout",
    {
      body: {
        lookup_key: request.lookupKey,
        server_quantity: request.serverQuantity,
        requires_seats: Boolean(request.requiresSeats),
        seat_count: request.seatCount ?? 1,
        ui_mode: request.uiMode,
        ...(request.installationId
          ? { installation_id: request.installationId }
          : {}),
        ...(request.currentLicenseKey
          ? { current_license_key: request.currentLicenseKey }
          : {}),
        ...(request.successUrl ? { success_url: request.successUrl } : {}),
        ...(request.cancelUrl ? { cancel_url: request.cancelUrl } : {}),
      },
    },
  );

  if (error) {
    throw new Error(`Failed to create checkout session: ${error.message}`);
  }
  if (data?.error) {
    throw new Error(data.error);
  }
  const clientSecret = data?.clientSecret ?? null;
  const url = data?.url ?? null;
  if (!clientSecret && !url) {
    throw new Error("create-checkout returned neither clientSecret nor URL");
  }
  return { clientSecret, url, sessionId: data?.sessionId ?? null };
}
