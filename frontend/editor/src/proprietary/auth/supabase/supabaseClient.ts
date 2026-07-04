/**
 * Shared Supabase client.
 *
 * The editor's saas build keeps its own richer client (profile pictures, pro
 * status, teams). This module is the portable Supabase path used by the shared
 * unified auth provider - notably so the portal can run in Supabase mode
 * against a hosted backend. The client is created lazily via
 * {@link configureSupabase}; until then {@link getSupabaseClient} returns null,
 * so hosts that never configure it (e.g. the portal in Spring mode) don't pull
 * Supabase into their session at all.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseAuthOptions {
  persistSession?: boolean;
  autoRefreshToken?: boolean;
  detectSessionInUrl?: boolean;
}

export interface SupabaseConfig {
  url: string;
  key: string;
  authOptions?: SupabaseAuthOptions;
}

let client: SupabaseClient | null = null;

/** Create (or replace) the shared Supabase client. Returns the instance. */
export function configureSupabase(config: SupabaseConfig): SupabaseClient {
  client = createClient(config.url, config.key, {
    auth: {
      persistSession: config.authOptions?.persistSession ?? true,
      autoRefreshToken: config.authOptions?.autoRefreshToken ?? true,
      detectSessionInUrl: config.authOptions?.detectSessionInUrl ?? true,
    },
  });
  return client;
}

/** The configured Supabase client, or null if not configured. */
export function getSupabaseClient(): SupabaseClient | null {
  return client;
}

/** Anonymous (guest) sign-in. Throws if Supabase is not configured. */
export async function signInAnonymously() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }
  return supabase.auth.signInAnonymously();
}

export const isUserAnonymous = (user: { is_anonymous?: boolean } | null) => {
  return user?.is_anonymous === true;
};

/** Fetch the current Supabase user, or null when unauthenticated/unconfigured. */
export async function getCurrentUser() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
