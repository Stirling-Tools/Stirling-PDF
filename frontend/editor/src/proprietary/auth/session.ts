import { supabase } from "@app/services/supabaseClient";

/** The Stirling account token used for checkout, independent of the local server login. */
export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
