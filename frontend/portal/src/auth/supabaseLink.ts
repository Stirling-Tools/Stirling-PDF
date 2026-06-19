import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";

/**
 * Supabase auth seam for the account-link surface.
 *
 * The portal admin signs in / signs up against the **SaaS** Supabase project so
 * the org's self-hosted instance can link the SaaS account. Config comes from
 * env (`VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`), mirroring
 * the editor app's names.
 *
 * ASSUMPTION: the SaaS Supabase project may not be wired into this repo yet. When
 * the env vars are absent {@link isSupabaseConfigured} is false and the auth
 * calls reject with a clear error; the Link-account UI shows a "not configured"
 * state instead of crashing, and the MSW-backed register/list/revoke flow still
 * works in dev with a placeholder token. Inject real config to go live — no code
 * change.
 */

export type { Session } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

// Lazily constructed: building a client at import time would throw in Storybook /
// MSW dev where config is intentionally absent.
let client: SupabaseClient | null = null;
function getClient(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase is not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY.",
    );
  }
  client ??= createClient(url!, anonKey!, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}

/** Signs in with email + password; returns the established session. */
export async function signIn(
  email: string,
  password: string,
): Promise<Session> {
  const { data, error } = await getClient().auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  if (!data.session) throw new Error("Sign-in returned no session.");
  return data.session;
}

/**
 * Signs up with email + password. Returns the session when the project issues
 * one immediately, or null when email confirmation is required.
 */
export async function signUp(
  email: string,
  password: string,
): Promise<Session | null> {
  const { data, error } = await getClient().auth.signUp({ email, password });
  if (error) throw error;
  return data.session;
}

/** Current session, or null when signed out / unconfigured. */
export async function getSession(): Promise<Session | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await getClient().auth.getSession();
  return data.session;
}

/** Signs the admin out of the SaaS Supabase project. */
export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured) return;
  await getClient().auth.signOut();
}
