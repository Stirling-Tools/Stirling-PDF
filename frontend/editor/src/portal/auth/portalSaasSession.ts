import { getSupabaseClient } from "@app/auth/supabase/supabaseClient";
import { ensureSaasSupabase } from "@portal/auth/saasSupabase";

/**
 * SaaS access token for attended portal→SaaS reads. Reads the shared Supabase
 * client — which each flavor configures via the {@link ensureSaasSupabase} seam:
 * self-hosted points it at the remote hosted project for account-linking (from
 * VITE_SAAS_SUPABASE_*), alongside the portal's own Spring session; SaaS points it
 * at the editor's own project (VITE_SUPABASE_*) so the editor session is inherited.
 * This reader is genuinely flavor-agnostic — the configurator is the seam, not
 * this — so it needs no per-flavor override. Returns null until a session exists.
 */
export async function getPortalSaasToken(): Promise<string | null> {
  ensureSaasSupabase();
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
