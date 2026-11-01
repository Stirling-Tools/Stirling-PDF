import { supabase } from "@editor/auth/supabase";
export {
  getCurrentUser,
  isUserAnonymous,
  signInAnonymously,
} from "@editor/auth/supabase";
export type {
  SupabaseConfig,
  SupabaseAuthOptions,
} from "@editor-proprietary/auth/supabase/supabaseClient";
import type { SupabaseConfig } from "@editor-proprietary/auth/supabase/supabaseClient";

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
