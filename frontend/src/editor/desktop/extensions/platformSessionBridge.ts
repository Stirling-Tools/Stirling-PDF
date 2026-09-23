import { STIRLING_SAAS_URL } from "@app/constants/connection";
import { connectionModeService } from "@app/services/connectionModeService";
import { authService } from "@app/services/authService";
import type { PlatformSessionUser } from "@proprietary/extensions/platformSessionBridge";

export async function isDesktopSaaSAuthMode(): Promise<boolean> {
  try {
    const mode = await connectionModeService.getCurrentMode();
    // Return true for ANY desktop auth mode (SaaS or self-hosted with desktop authService)
    // This skips redundant backend validation in springAuthClient since desktop authService
    // already manages the token lifecycle
    return mode === "saas" || mode === "selfhosted";
  } catch {
    return false;
  }
}

/**
 * In SaaS mode the apiClient points at the SaaS gateway, which doesn't
 * expose `/api/v1/auth/logout` (Supabase manages session lifecycle); POSTing
 * there returns 500 and floods the error toasts even though local cleanup
 * succeeds. Self-hosted mode IS a Spring backend so the endpoint exists.
 */
export async function shouldCallBackendLogout(): Promise<boolean> {
  try {
    const mode = await connectionModeService.getCurrentMode();
    return mode !== "saas";
  } catch {
    // If we can't read the mode, err on the side of trying the POST -
    // a 500 is noisy but the catch branch still completes the local
    // sign-out, so we'd rather attempt the backend call than skip it
    // for a deployment that actually does have the endpoint.
    return true;
  }
}

/**
 * Supabase JWT payload claims we care about. Desktop knows it issues
 * Supabase-shaped tokens, so it can read them with proper types here -
 * proprietary's auth client never needs to learn about user_metadata.
 */
interface SupabaseJwtClaims {
  email?: string;
  user_metadata?: {
    full_name?: string;
    name?: string;
  };
  is_anonymous?: boolean;
}

/**
 * Decode the payload section of a JWT for display purposes only.
 *
 * SECURITY: this does NOT verify the signature. The returned claims are
 * untrusted - never use them for authorisation decisions. The Supabase
 * server validates the signature on every API call; this decoder exists
 * solely to render the user's name/email in the UI before that
 * server-validated state lands.
 */
function decodeSupabaseJwt(token: string): SupabaseJwtClaims | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    return JSON.parse(atob(base64)) as SupabaseJwtClaims;
  } catch {
    return null;
  }
}

export async function getPlatformSessionUser(): Promise<PlatformSessionUser | null> {
  // Preferred source: the Tauri-cached user_info written at login time.
  let cachedUser: { username: string; email: string | undefined } | null = null;
  try {
    const userInfo = await authService.getUserInfo();
    if (userInfo) {
      cachedUser = {
        username: userInfo.username,
        email: userInfo.email,
      };
    }
  } catch {
    /* fall through to JWT decode */
  }

  // Fallback: decode the JWT itself. The cache can lag (the
  // jwt-available event fires before save_user_info in OAuth login) or be
  // missing entirely (older tokens minted before user_info caching was
  // wired up). The token always carries enough to identify the account.
  let jwtClaims: SupabaseJwtClaims | null = null;
  const token =
    typeof window !== "undefined"
      ? window.localStorage.getItem("stirling_jwt")
      : null;
  if (token) {
    jwtClaims = decodeSupabaseJwt(token);
  }

  if (!cachedUser && !jwtClaims) {
    return null;
  }

  const email = cachedUser?.email || jwtClaims?.email;
  const metadata = jwtClaims?.user_metadata;
  const username =
    cachedUser?.username ||
    metadata?.full_name ||
    metadata?.name ||
    email ||
    "";

  return {
    username,
    email,
    is_anonymous: jwtClaims?.is_anonymous === true,
  };
}

export async function refreshPlatformSession(): Promise<boolean> {
  try {
    const mode = await connectionModeService.getCurrentMode();
    if (mode === "saas") {
      return await authService.refreshSupabaseToken(STIRLING_SAAS_URL);
    } else if (mode === "selfhosted") {
      const serverConfig = await connectionModeService.getServerConfig();
      if (!serverConfig) {
        return false;
      }
      return await authService.refreshToken(serverConfig.url);
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Save token to platform-specific secure storage (Tauri store + localStorage)
 * Called after token refresh to ensure token is synced across all storage locations
 */
export async function savePlatformToken(token: string): Promise<void> {
  try {
    await authService.saveToken(token);
  } catch (error) {
    console.error("[PlatformBridge] Failed to save token:", error);
    throw error;
  }
}
