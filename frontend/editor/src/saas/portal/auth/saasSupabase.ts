import {
  configureSupabase,
  getSupabaseClient,
} from "@app/auth/supabase/supabaseClient";

// Flavor-neutral constants (SSO provider list, pending-link sessionStorage key)
// belong to the self-hosted link flow, which is tree-shaken out of the SaaS
// bundle — but re-export them so this override stays a drop-in for the module's
// full surface (base link code stays type-checkable under the SaaS cascade).
export {
  SAAS_OAUTH_PROVIDERS,
  PENDING_LINK_KEY,
} from "@portalCore/auth/saasSupabase";

/**
 * SaaS override of the account-link Supabase configurator.
 *
 * There is no account-link step on SaaS — the portal authenticates against the
 * SAME Supabase project as the SaaS editor. So configure the shared client from
 * the editor's own env ({@code VITE_SUPABASE_URL} + the publishable key), NOT the
 * self-hosted {@code VITE_SAAS_SUPABASE_*} vars (which point a self-hosted
 * instance at the remote hosted project for linking, and are unset here).
 *
 * Because it's the same project, the client this configures shares the editor's
 * persisted localStorage session — so a user already signed into the SaaS editor
 * is picked up with no second login (the "inherited session"). Reusing the
 * editor's env also means the SaaS build needs no SaaS-specific Supabase vars.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

export const isSaasSupabaseConfigured = Boolean(url && key);

let configured = false;

/** Configure the shared Supabase client once (idempotent). Returns the client, or
 * null when the editor's Supabase env isn't set. */
export function ensureSaasSupabase() {
  if (!isSaasSupabaseConfigured) return null;
  if (!configured) {
    configureSupabase({ url: url as string, key: key as string });
    configured = true;
  }
  return getSupabaseClient();
}
