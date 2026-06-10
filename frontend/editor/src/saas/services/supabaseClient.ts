// SaaS-layer override for `@app/services/supabaseClient`.
//
// There must be exactly ONE Supabase client (one GoTrueClient) per browser
// context. The :proprietary version of this module calls createClient() a
// second time with the same auth-token storage key as :saas's
// `@app/auth/supabase`. In the SaaS bundle, billing/licensing/user-management
// code (CheckoutContext, licenseService, AdminPlanSection, userManagementService)
// imports `@app/services/supabaseClient` and would otherwise pull in that second
// client. Two clients => two independent autoRefreshToken timers racing on the
// same refresh token => "Multiple GoTrueClient instances detected", rotated /
// "Already Used" refresh tokens, and spurious 401s (e.g. /api/v1/storage/*).
//
// Re-exporting the singleton from `@app/auth/supabase` keeps every
// `@app/services/supabaseClient` consumer pointed at the same instance, so the
// :proprietary module's createClient() is never bundled in the SaaS build.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as supabaseSingleton } from "@app/auth/supabase";

// `@app/auth/supabase` throws on missing config, so in the SaaS build the
// client is always present and Supabase is always configured.
export const supabase: SupabaseClient | null = supabaseSingleton;
export const isSupabaseConfigured = true;
