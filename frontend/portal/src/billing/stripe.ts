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

interface CheckoutSessionRequest {
  teamId: number;
  /** Where Stripe redirects on success — typically the portal billing page. */
  successUrl: string;
  /** Where Stripe redirects on cancel/close. */
  cancelUrl: string;
  /** Optional monthly cap in USD. null = no cap. */
  capUsd?: number | null;
}

interface PortalSessionRequest {
  teamId: number;
  returnUrl: string;
}

interface SessionUrlResponse {
  url: string;
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
 * Mint a Stripe Checkout session for PAYG subscription. The browser is
 * redirected to {@code url}; on completion the webhook flips the team to
 * subscribed and the portal picks it up via {@code fetchWallet}.
 */
export async function createCheckoutSession(
  req: CheckoutSessionRequest,
): Promise<string> {
  const { url } = await invoke<SessionUrlResponse>("create-checkout-session", {
    team_id: req.teamId,
    success_url: req.successUrl,
    cancel_url: req.cancelUrl,
    cap_usd: req.capUsd ?? null,
  });
  return url;
}

/**
 * Mint a Stripe Customer Portal session. The admin can manage their card,
 * view invoices, and cancel from Stripe's hosted UI. Returns 404 with
 * {@code team_not_subscribed} if called for a free team — caller toasts that.
 */
export async function createPortalSession(
  req: PortalSessionRequest,
): Promise<string> {
  const { url } = await invoke<SessionUrlResponse>(
    "create-customer-portal-session",
    {
      team_id: req.teamId,
      return_url: req.returnUrl,
    },
  );
  return url;
}
