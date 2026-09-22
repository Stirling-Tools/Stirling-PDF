import { supabase } from "@app/auth/supabase";
export {
  getCurrentUser,
  isUserAnonymous,
  signInAnonymously,
} from "@app/auth/supabase";
export type {
  SupabaseConfig,
  SupabaseAuthOptions,
} from "@proprietary/auth/supabase/supabaseClient";
import type { SupabaseConfig } from "@proprietary/auth/supabase/supabaseClient";

/** Unified auth and billing share the hosted app's singleton and standard SDK storage. */
export function getSupabaseClient() {
  return supabase;
}
export function configureSupabase(_config: SupabaseConfig) {
  return supabase;
}
export function clearSupabaseSession(): void {
  void supabase.auth.signOut({ scope: "local" });
}
