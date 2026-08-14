import {
  configureSupabase,
  getSupabaseClient,
} from "@app/auth/supabase/supabaseClient";

/**
 * Configures the shared Supabase client against the Stirling Supabase project so
 * the portal can mint a SaaS JWT IN-APP for account linking (no popup). This is a
 * separate, transient SaaS auth — the portal's own session stays Spring (the
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

/**
 * Whether an OAuth sign-in can actually finish on this origin.
 *
 * Supabase honours a `redirectTo` only when it matches the project's Redirect URLs allow-list;
 * anything else falls back to the project's Site URL, which is the SaaS app. A customer's own
 * server (https://pdf.acme.internal, http://192.168.1.20:8080) will never be on that list, so the
 * admin would complete the provider round trip, land on the SaaS site, and this instance would
 * never receive a session — a button that silently cannot work. Wildcards can cover a domain we
 * own, not the open set of customer hostnames, so this is opt-in per deployment rather than
 * something we can detect.
 *
 * Set VITE_SAAS_OAUTH_ENABLED=true only for origins that ARE allow-listed on the Supabase project
 * (deployments we host). Email and password work regardless.
 */
export const isSaasOAuthAvailable =
  import.meta.env.VITE_SAAS_OAUTH_ENABLED === "true";

/** OAuth providers offered, empty when the round trip cannot return to this origin. */
export const SAAS_OAUTH_PROVIDERS = isSaasOAuthAvailable
  ? ["google", "github", "apple", "azure"]
  : [];

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
