/** Account-owned Team checkout and the separate installed Enterprise licence checkout. */
import { supabase, isSupabaseConfigured } from "@app/services/supabaseClient";
import { getAccessToken } from "@app/auth/session";

/**
 * A Team-plan checkout, sized in user blocks rather than seats.
 *
 * {@link uiMode} follows the instance's own protocol: Stripe's embedded iframe needs a secure
 * context, so a plain-HTTP instance asks for `"hosted"` and supplies the two return URLs.
 */
export interface ServerPlanCheckoutRequest {
  /** Stripe price lookup key for the chosen period, e.g. `selfhosted:team:yearly`. */
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

  const token = await getAccessToken();
  if (!request.requiresSeats && !token) {
    throw new Error(
      "Sign in to the Stirling account you want to buy Team for, then try again.",
    );
  }

  const { data, error } = await supabase.functions.invoke<CheckoutResponse>(
    "create-checkout",
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: {
        lookup_key: request.lookupKey,
        server_quantity: request.serverQuantity,
        requires_seats: Boolean(request.requiresSeats),
        ...(request.requiresSeats ? { self_hosted: true } : {}),
        seat_count: request.seatCount ?? 1,
        ui_mode: request.uiMode,
        installation_id: request.installationId,
        current_license_key: request.currentLicenseKey,
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
      },
    },
  );

  if (error) {
    let message = error.message;
    if (error.context instanceof Response) {
      try {
        const details: unknown = await error.context.clone().json();
        if (
          details &&
          typeof details === "object" &&
          "error" in details &&
          typeof details.error === "string"
        ) {
          message = details.error;
        }
      } catch {
        // A gateway response may have no JSON body; keep the transport error.
      }
    }
    throw new Error(`Failed to create checkout session: ${message}`);
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

export interface PendingTeamChange {
  scheduleId: string;
  quantity: number;
  effectiveAt: number;
  interval: string | null;
}

/** Reads or cancels a future Team change; the Edge function verifies the billing leader. */
export async function teamSubscriptionChange(
  action: "status" | "cancel",
  scheduleId?: string,
): Promise<{
  pending: PendingTeamChange | null;
  unsupportedSchedule?: boolean;
}> {
  if (!supabase) throw new Error("Checkout is not configured");
  const token = await getAccessToken();
  if (!token) throw new Error("Sign in to manage your Team plan");
  const { data, error } = await supabase.functions.invoke(
    "team-subscription-change",
    {
      headers: { Authorization: `Bearer ${token}` },
      body: { action, scheduleId },
    },
  );
  if (error || data?.error) throw new Error(data?.error || error?.message);
  return data;
}

/** Returns confirmed purchased seats, a future change, or null while fulfilment is pending. */
export async function verifyTeamCheckout(
  sessionId: string,
  quantity: number,
): Promise<number | PendingTeamChange | null> {
  if (!supabase) throw new Error("Checkout is not configured");
  const token = await getAccessToken();
  if (!token) throw new Error("Sign in to verify the Team purchase");
  const { data, error } = await supabase.functions.invoke<{
    ready: boolean;
    licensedUsers?: number;
    scheduled?: PendingTeamChange;
  }>("complete-team-checkout", {
    headers: { Authorization: `Bearer ${token}` },
    body: { session_id: sessionId, quantity },
  });
  if (error) throw error;
  if (data?.scheduled) return data.scheduled;
  const users = data?.licensedUsers;
  return data?.ready &&
    typeof users === "number" &&
    Number.isInteger(users) &&
    users > 0
    ? users
    : null;
}
