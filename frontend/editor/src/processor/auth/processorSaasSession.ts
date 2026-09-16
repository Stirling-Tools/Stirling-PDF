import { getSupabaseClient } from "@app/auth/supabase/supabaseClient";
import { ensureSaasSupabase } from "@processor/auth/saasSupabase";

/**
 * Self-hosted processor→SaaS reads use the account-link session alongside the local
 * Spring session. Returns null until that separate SaaS session exists. The
 * hosted build overrides this with its existing app session.
 */
export async function getProcessorSaasToken(): Promise<string | null> {
  ensureSaasSupabase();
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
