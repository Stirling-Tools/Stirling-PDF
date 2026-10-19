import apiClient from "@app/services/apiClient";
import { JWT_STORAGE_KEY } from "@app/auth/httpClient";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";

export type LoginLandingMode = "editor" | "dynamic";

export function isPortalAvailable(): boolean {
  return import.meta.env.VITE_INCLUDE_PORTAL === "true" || import.meta.env.DEV;
}

export function loginLandingMode(): LoginLandingMode {
  return import.meta.env.VITE_LOGIN_LANDING_MODE === "editor"
    ? "editor"
    : "dynamic";
}

interface MeUser {
  portalAccess?: boolean;
  loginLandingView?: string;
}

export type RootDestination = "processor" | "editor" | "signedOut";

function editorRegardless(): boolean {
  return loginLandingMode() !== "dynamic" || !isPortalAvailable();
}

/** A stored JWT counts while its `exp` claim is unexpired; opaque tokens have no claim to read. */
function jwtIsUnexpired(token: string): boolean {
  const payload = token.split(".")[1];
  // An opaque token has no expiry to read; presence is all this check knows.
  if (!payload) return true;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const claims = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof claims.exp !== "number" || claims.exp * 1000 > Date.now();
  } catch {
    // An unreadable token is the auth layer's problem to reject, not a reason
    // to send a signed-in visitor through login first.
    return true;
  }
}

function hasAnyStoredSession(): boolean {
  try {
    if (typeof window === "undefined") return true;
    const storage = window.localStorage;
    const token = storage.getItem(JWT_STORAGE_KEY);
    if (token && jwtIsUnexpired(token)) return true;
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith("sb-") && key.endsWith("-auth-token")) return true;
    }
    return false;
  } catch {
    // Storage blocked: fall through to the network check.
    return true;
  }
}

/**
 * Synchronous root destination when known without network IO.
 * Returns null to render "/", EDITOR_BASENAME to redirect immediately, or undefined when /me is needed.
 */
export function initialRootTarget(): string | null | undefined {
  if (!hasAnyStoredSession()) return null;
  if (editorRegardless()) return EDITOR_BASENAME;
  return undefined;
}

export async function resolveRootTarget(): Promise<string | null> {
  if (!hasAnyStoredSession()) return null;
  if (editorRegardless()) return EDITOR_BASENAME;
  const destination = await fetchRootDestination();
  if (destination === "signedOut") return null;
  return destination === "processor" ? PORTAL_BASENAME : EDITOR_BASENAME;
}

export async function resolveLandingPath(): Promise<string> {
  return (await resolveRootTarget()) ?? EDITOR_BASENAME;
}

export async function fetchRootDestination(): Promise<RootDestination> {
  // No stored session of either flavor, so /me would only 401: self-hosted
  // keeps a Spring JWT, SaaS a Supabase sb-*-auth-token session.
  if (!hasAnyStoredSession()) {
    return "signedOut";
  }
  let user: MeUser | undefined;
  try {
    const me = await apiClient.get<{ user?: MeUser }>("/api/v1/auth/me", {
      suppressErrorToast: true,
    });
    user = me.data?.user;
  } catch {
    return "signedOut";
  }
  if (!user) return "signedOut";

  return user.loginLandingView === "processor" && user.portalAccess === true
    ? "processor"
    : "editor";
}
