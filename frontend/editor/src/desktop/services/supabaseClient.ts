import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { STIRLING_SAAS_URL, SUPABASE_KEY } from "@app/constants/connection";

/**
 * Desktop override of the licensing client. Licensing and Team checkout go to
 * the Stirling Cloud the app signs in to (VITE_SAAS_SERVER_URL), not to
 * VITE_SUPABASE_URL: two settings for one project could otherwise disagree and
 * split a purchase across two projects, so lookups and checkout fail.
 */
export const isSupabaseConfigured = Boolean(STIRLING_SAAS_URL && SUPABASE_KEY);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(STIRLING_SAAS_URL, SUPABASE_KEY, {
      auth: { detectSessionInUrl: false, persistSession: false },
    })
  : null;
