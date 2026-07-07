import { getSupabaseClient } from "@app/auth/supabase/supabaseClient";
import { ensureSaasSupabase } from "@portal/auth/saasSupabase";

/**
 * SaaS access token for attended portal→SaaS reads. Reads the shared Supabase
 * client — which each flavor's auth boundary configures and signs in:
 * self-hosted via the account-link login ({@link ensureSaasSupabase} + the link
 * modal, alongside the portal's own Spring session); SaaS via the portal's own
 * Supabase auth boundary against the SaaS project. Flavor-agnostic (the client is
 * the seam, not this reader), so no per-flavor override is needed. Returns null
 * until a SaaS session exists.
 */
export async function getPortalSaasToken(): Promise<string | null> {
  ensureSaasSupabase();
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
