/// <reference types="vite/client" />

const REDIRECT_GUARD_KEY = "stirling.portal.login-redirecting";

/**
 * The shared Stirling login page. Defaults to same-origin "/login" (the
 * editor's login route, served alongside the portal in prod, so a single login
 * covers both apps). In dev the portal runs on a different port than the login
 * UI, so point VITE_PORTAL_LOGIN_URL at it (e.g. the editor dev server); the
 * session cookie is still shared because cookies are host-scoped, not port.
 */
export function getLoginUrl(): string {
  return import.meta.env.VITE_PORTAL_LOGIN_URL || "/login";
}

/** Cleared on the first authenticated response so a later expiry can redirect again. */
export function clearLoginRedirectGuard(): void {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(REDIRECT_GUARD_KEY);
  }
}

let redirecting = false;

/**
 * Send the browser to the shared login, returning here afterwards. Guarded
 * twice: a module flag collapses the burst of 401s on load into one navigation,
 * and a sessionStorage flag stops a loop if we bounce to login and come back
 * still unauthenticated (e.g. the login URL is misconfigured to the portal's
 * own origin, which has no login route).
 */
export function redirectToLogin(): void {
  if (typeof window === "undefined" || redirecting) return;
  if (window.sessionStorage.getItem(REDIRECT_GUARD_KEY)) return;
  redirecting = true;
  window.sessionStorage.setItem(REDIRECT_GUARD_KEY, "1");
  const base = getLoginUrl();
  const sep = base.includes("?") ? "&" : "?";
  window.location.href = `${base}${sep}redirect=${encodeURIComponent(window.location.href)}`;
}
