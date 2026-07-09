import { getSupabaseClient } from "@app/auth/supabase/supabaseClient";
import { ensureSaasSupabase } from "@portal/auth/saasSupabase";

/**
 * SaaS access token for attended portal→SaaS reads. Reads the shared Supabase
 * client, which {@link ensureSaasSupabase} configures against the one Stirling
 * Supabase project (VITE_SUPABASE_*) both flavors talk to: self-hosted mints a
 * SaaS JWT in-app for account-linking (alongside its own Spring session); SaaS is
 * already signed into that same project, so the editor session is inherited.
 * Flavor-agnostic — no per-flavor override needed. Returns null until a session
 * exists.
 */
export async function getPortalSaasToken(): Promise<string | null> {
  ensureSaasSupabase();
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
