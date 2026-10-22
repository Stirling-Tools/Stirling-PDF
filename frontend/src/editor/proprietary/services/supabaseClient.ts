import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

// Check if Supabase is configured
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

// Licensing uses installation/license-key identity; attended sessions belong to the portal client.
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { detectSessionInUrl: false, persistSession: false },
    })
  : null;

// Log warning if not configured (for self-hosted installations)
if (!isSupabaseConfigured) {
  console.warn(
    "Supabase is not configured. Checkout and billing features will be disabled. " +
      "Static plan information will be displayed instead.",
  );
}
