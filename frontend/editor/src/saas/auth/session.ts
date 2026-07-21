import { supabase } from "@app/auth/supabase";
import type { AppSession } from "@cloud/auth/session";

export type { AppSession };

/**
 * SaaS (web) implementation of the @app/auth/session seam.
 *
 * Reads the Supabase web session and returns its access token. Mirrors the
 * token lookup that apiClientSetup.getAuthHeaders performed previously.
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  } catch (e) {
    console.warn("[auth/session] Failed to read Supabase session", e);
    return null;
  }
}
