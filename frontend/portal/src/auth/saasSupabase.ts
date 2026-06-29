import {
  configureSupabase,
  getSupabaseClient,
} from "@shared/auth/supabase/supabaseClient";

/**
 * Configures the shared Supabase client against the hosted SaaS project so the
 * portal can mint a SaaS JWT IN-APP for account linking (no popup). This is a
 * separate, transient SaaS auth — the portal's own session stays Spring (the
 * local instance admin); calls to the local backend still carry the Spring
 * bearer, and the SaaS JWT is passed only in the link request body.
 *
 * Config: VITE_SAAS_SUPABASE_URL + VITE_SAAS_SUPABASE_ANON_KEY (both public).
 * Absent → {@link isSaasSupabaseConfigured} is false and the link UI degrades to
 * a "configure the SaaS Supabase URL" state.
 */
const url = import.meta.env.VITE_SAAS_SUPABASE_URL;
const key = import.meta.env.VITE_SAAS_SUPABASE_ANON_KEY;

export const isSaasSupabaseConfigured = Boolean(url && key);

/** OAuth providers the hosted SaaS login offers (mirrors the SaaS editor login). */
export const SAAS_OAUTH_PROVIDERS = ["google", "github", "apple", "azure"];

/** sessionStorage marker set before an SSO redirect so the return can finish the link. */
export const PENDING_LINK_KEY = "stirling-account-link-pending";

let configured = false;

/**
 * Configure the shared Supabase client once (idempotent). Returns the client, or
 * null when the SaaS Supabase env isn't set. `detectSessionInUrl` (on by default)
 * means an SSO redirect back to the portal is picked up here.
 */
export function ensureSaasSupabase() {
  if (!isSaasSupabaseConfigured) return null;
  if (!configured) {
    configureSupabase({ url: url as string, key: key as string });
    configured = true;
  }
  return getSupabaseClient();
}
