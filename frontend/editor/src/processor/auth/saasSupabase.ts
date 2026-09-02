import {
  configureSupabase,
  getSupabaseClient,
} from "@app/auth/supabase/supabaseClient";

/**
 * Configures the shared Supabase client against the Stirling Supabase project so
 * the processor can mint a SaaS JWT IN-APP for account linking (no popup). This is a
 * separate, transient SaaS auth — the processor's own session stays Spring (the
 * local instance admin); calls to the local backend still carry the Spring
 * bearer, and the SaaS JWT is passed only in the link request body.
 *
 * Config: VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY (both public)
 * — the one Stirling Supabase project every flavor talks to (same vars the editor
 * and proprietary billing client use; there is no separate SaaS project). SaaS
 * needs no per-flavor override: the signed-in editor session is on this same
 * project, so the client picks it up. Absent → {@link isSaasSupabaseConfigured}
 * is false and the link UI degrades to a "configure Supabase" state.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

export const isSaasSupabaseConfigured = Boolean(url && key);

/*
 * SAAS_OAUTH_PROVIDERS and PENDING_LINK_KEY are gone. They served an in-portal SSO sign-in that
 * could not work: the provider only redirects to allow-listed URLs, so a customer's origin was
 * never returned to and the admin was left on stirling.com. Provider choice now happens on our own
 * origin during the connect handshake, where the redirect can actually complete.
 */

let configured = false;

/**
 * Configure the shared Supabase client once (idempotent). Returns the client, or
 * null when the SaaS Supabase env isn't set. `detectSessionInUrl` (on by default)
 * means an SSO redirect back to the processor is picked up here.
 */
export function ensureSaasSupabase() {
  if (!isSaasSupabaseConfigured) return null;
  if (!configured) {
    configureSupabase({ url: url, key: key });
    configured = true;
  }
  return getSupabaseClient();
}
