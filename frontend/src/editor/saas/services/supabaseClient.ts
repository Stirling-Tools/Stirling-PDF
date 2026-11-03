// SaaS override of `@editor/services/supabaseClient`: re-export the auth
// singleton so exactly one GoTrueClient (one refresh timer) exists per tab.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as supabaseSingleton } from "@editor/auth/supabase";

// `@editor/auth/supabase` throws on missing config, so the client always exists.
export const supabase: SupabaseClient | null = supabaseSingleton;
export const isSupabaseConfigured = true;
