import {
  configureSupabase,
  getSupabaseClient,
} from "@app/auth/supabase/supabaseClient";

// The browser's SaaS billing session is independent of its local Spring login.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

export const isSaasSupabaseConfigured = Boolean(url && key);

let configured = false;

/**
 * Returns the shared client, or null when SaaS isn't configured. Callback tokens
 * must be validated by the account-link host before installation, never by URL detection.
 */
export function ensureSaasSupabase() {
  if (!isSaasSupabaseConfigured) return null;
  if (!configured || !getSupabaseClient()) {
    configureSupabase({
      url: url,
      key: key,
      authOptions: { detectSessionInUrl: false },
    });
    configured = true;
  }
  return getSupabaseClient();
}
