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
let clientInvalidation: string | null = null;
const INVALIDATION_KEY = "stirling.saasSessionGeneration";

function readInvalidation(): string | null {
  try {
    return localStorage.getItem(INVALIDATION_KEY);
  } catch {
    return null;
  }
}

function invalidateClient(): void {
  generation++;
  if (client) void client.auth.stopAutoRefresh().catch(() => {});
  client = null;
  window.dispatchEvent(new Event("stirling-saas-session-cleared"));
}

window.addEventListener("storage", (event) => {
  if (event.key === INVALIDATION_KEY || event.key === null) invalidateClient();
});

/** Create (or replace) the shared Supabase client. Returns the instance. */
export function configureSupabase(config: SupabaseConfig): SupabaseClient {
  if (client) void client.auth.stopAutoRefresh().catch(() => {});
  const current = ++generation;
  const invalidation = readInvalidation();
  clientInvalidation = invalidation;
  const active = () =>
    current === generation && invalidation === readInvalidation();
  const memory = new Map<string, string>();
  let memoryOnly = false;
  storageKey = `sb-${new URL(config.url).hostname.split(".")[0]}-auth-token`;
  client = createClient(config.url, config.key, {
    auth: {
      storageKey,
      storage: {
        getItem: (key: string) => {
          if (!active()) return null;
          if (memoryOnly) return memory.get(key) ?? null;
          try {
            const stored = localStorage.getItem(key);
            if (!stored) return null;
            try {
              const envelope = JSON.parse(stored);
              if (envelope?.stirlingSessionVersion === 1) {
                const value =
                  envelope.generation === invalidation &&
                  typeof envelope.value === "string"
                    ? envelope.value
                    : null;
                if (value !== null) memory.set(key, value);
                return value;
              }
              if (
                envelope &&
                typeof envelope === "object" &&
                !Array.isArray(envelope)
              ) {
                if (
                  (envelope.stirlingSessionGeneration ?? null) !== invalidation
                )
                  return null;
                memory.set(key, stored);
                return stored;
              }
            } catch {
              // SDK code-verifier entries are plain strings, unlike serialized sessions.
            }
            if (invalidation !== null) return null;
            memory.set(key, stored);
            return stored;
          } catch {
            memoryOnly = true;
            return memory.get(key) ?? null;
          }
        },
        setItem: (key: string, value: string) => {
          if (!active()) return;
          memory.set(key, value);
          if (memoryOnly) return;
          try {
            let serialized = JSON.stringify({
              stirlingSessionVersion: 1,
              generation: invalidation,
              value,
            });
            try {
              const session = JSON.parse(value);
              if (
                session &&
                typeof session === "object" &&
                !Array.isArray(session)
              ) {
                // Preserve the SDK's session shape for clients reading the same storage key.
                serialized = JSON.stringify({
                  ...session,
                  stirlingSessionGeneration: invalidation,
                });
              }
            } catch {
              // Non-JSON SDK entries retain their value inside the versioned envelope.
            }
            // A late cross-tab write is unreadable even if it races the invalidation check.
            localStorage.setItem(key, serialized);
          } catch {
            memoryOnly = true;
          }
        },
        removeItem: (key: string) => {
          if (!active()) return;
          memory.delete(key);
          try {
            localStorage.removeItem(key);
          } catch {
            memoryOnly = true;
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
  invalidateClient();
  try {
    const marker = Array.from(
      crypto.getRandomValues(new Uint8Array(16)),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    localStorage.setItem(INVALIDATION_KEY, marker);
  } catch {
    // This tab is invalidated even when browser storage is unavailable.
  }
  if (storageKey) {
    for (const suffix of ["", "-user", "-code-verifier"]) {
      try {
        localStorage.removeItem(`${storageKey}${suffix}`);
      } catch {
        // The invalidation marker still blocks stale credentials when only deletion fails.
      }
    }
  }
}

/** The configured Supabase client, or null if not configured. */
export function getSupabaseClient(): SupabaseClient | null {
  if (client && clientInvalidation !== readInvalidation()) invalidateClient();
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
