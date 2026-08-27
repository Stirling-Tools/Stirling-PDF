import { authService } from "@app/services/authService";
import type { AppSession } from "@cloud/auth/session";

export type { AppSession };

/**
 * Desktop (Tauri) implementation of the @app/auth/session seam.
 *
 * Delegates to authService, which manages the JWT in the Tauri secure store
 * (with a localStorage fallback) and validates/caches it. Behaviour of
 * authService is unchanged — this only exposes its existing accessor.
 */
export async function getAccessToken(): Promise<string | null> {
  return authService.getAuthToken();
}
