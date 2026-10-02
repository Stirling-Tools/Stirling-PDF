import {
  configureSupabase,
  getSupabaseClient,
} from "@app/auth/supabase/supabaseClient";
import { STIRLING_SAAS_URL, SUPABASE_KEY } from "@app/constants/connection";

// The billing session comes from desktop's own Stirling sign-in, so it lives on
// the host that issued its tokens (auth.stirling.com) and refreshes there.
export const isSaasSupabaseConfigured = Boolean(
  STIRLING_SAAS_URL && SUPABASE_KEY,
);

let configured = false;

/** Desktop variant of the base seam: same contract, the desktop auth host. */
export function ensureSaasSupabase() {
  if (!isSaasSupabaseConfigured) return null;
  if (!configured || !getSupabaseClient()) {
    configureSupabase({
      url: STIRLING_SAAS_URL,
      key: SUPABASE_KEY,
      authOptions: { detectSessionInUrl: false },
    });
    configured = true;
  }
  return getSupabaseClient();
}
