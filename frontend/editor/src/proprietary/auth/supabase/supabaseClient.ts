/**
 * Shared Supabase client.
 *
 * Used by unified Supabase auth and the self-hosted portal's attended billing
 * session. Local Spring authentication remains separate. Clearing or replacing
 * the client invalidates storage access by its pending SDK requests.
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
let generation = 0;
let storageKey: string | null = null;

/** Create (or replace) the shared Supabase client. Returns the instance. */
export function configureSupabase(config: SupabaseConfig): SupabaseClient {
  if (client) void client.auth.stopAutoRefresh().catch(() => {});
  const current = ++generation;
  const memory = new Map<string, string>();
  storageKey = `sb-${new URL(config.url).hostname.split(".")[0]}-auth-token`;
  client = createClient(config.url, config.key, {
    auth: {
      storageKey,
      storage: {
        getItem: (key: string) => {
          if (current !== generation) return null;
          try {
            return localStorage.getItem(key);
          } catch {
            return memory.get(key) ?? null;
          }
        },
        setItem: (key: string, value: string) => {
          if (current !== generation) return;
          memory.set(key, value);
          try {
            localStorage.setItem(key, value);
          } catch {
            /* Storage can be disabled in private browsing. */
          }
        },
        removeItem: (key: string) => {
          if (current !== generation) return;
          memory.delete(key);
          try {
            localStorage.removeItem(key);
          } catch {
            /* The in-memory session has already been removed. */
          }
        },
      },
      persistSession: config.authOptions?.persistSession ?? true,
      autoRefreshToken: config.authOptions?.autoRefreshToken ?? true,
      detectSessionInUrl: config.authOptions?.detectSessionInUrl ?? true,
    },
  });
  return client;
}

/** Clears this browser only; late SDK refreshes cannot restore a cleared user's session. */
export function clearSupabaseSession(): void {
  generation++;
  if (client) void client.auth.stopAutoRefresh().catch(() => {});
  client = null;
  if (storageKey) {
    for (const suffix of ["", "-user", "-code-verifier"])
      localStorage.removeItem(`${storageKey}${suffix}`);
  }
  window.dispatchEvent(new Event("stirling-saas-session-cleared"));
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
