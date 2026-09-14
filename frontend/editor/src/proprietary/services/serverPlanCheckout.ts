/** Account-owned Team checkout and the separate installed Enterprise licence checkout. */
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
  /** Installed licence being upgraded; Enterprise uses it to resolve the billing owner. */
  currentLicenseKey?: string;
  uiMode: "embedded" | "hosted";
  /** Required for hosted checkout and existing-subscription portal updates. */
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

/** Team requires a signed-in account; Enterprise uses the licence-issuing self-hosted flow. */
export async function createServerPlanCheckoutSession(
  request: ServerPlanCheckoutRequest,
): Promise<ServerPlanCheckoutSession> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured. Checkout is not available.");
  }

  const { data: session } = await supabase.auth.getSession();
  if (!request.requiresSeats && !session.session) {
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
        ...(request.requiresSeats ? { self_hosted: true } : {}),
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

/** Confirms the account's purchased capacity and requests idempotent fulfilment if the webhook is delayed. */
export async function verifyTeamCheckout(
  sessionId: string,
  quantity: number,
): Promise<boolean> {
  if (!supabase) throw new Error("Checkout is not configured");
  const { data, error } = await supabase.functions.invoke<{ ready: boolean }>(
    "complete-team-checkout",
    {
      body: { session_id: sessionId, quantity },
    },
  );
  if (error) throw error;
  return data?.ready === true;
}
