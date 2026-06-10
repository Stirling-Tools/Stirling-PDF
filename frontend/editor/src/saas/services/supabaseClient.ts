// SaaS override of `@app/services/supabaseClient`: re-export the auth
// singleton so exactly one GoTrueClient (one refresh timer) exists per tab.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as supabaseSingleton } from "@app/auth/supabase";

// `@app/auth/supabase` throws on missing config, so the client always exists.
export const supabase: SupabaseClient | null = supabaseSingleton;
export const isSupabaseConfigured = true;
