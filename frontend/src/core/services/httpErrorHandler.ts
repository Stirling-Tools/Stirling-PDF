// frontend/src/services/httpErrorHandler.ts
import { alert } from "@app/components/toast";
import {
  broadcastErroredFiles,
  extractErrorFileIds,
  normalizeAxiosErrorData,
} from "@app/services/errorUtils";
import { showSpecialErrorToast } from "@app/services/specialErrorToasts";
import { handleSaaSError } from "@app/services/saasErrorInterceptor";
import {
  clampText,
  extractAxiosErrorMessage,
} from "@app/services/httpErrorUtils";

// Module-scoped state to reduce global variable usage
const recentSpecialByEndpoint: Record<string, number> = {};
const SPECIAL_SUPPRESS_MS = 1500; // brief window to suppress generic duplicate after special toast

// Keep in sync with the same constant in proprietary/auth/springAuthClient.ts.
// AuthCallback consumes this after the SSO round-trip to restore the user's
// original destination. The query-string ?from= approach does not survive
// because Spring Security 302-strips the query from /login.
const POST_LOGIN_REDIRECT_STORAGE_KEY = "stirling_post_login_path";

function isSafePostLoginPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) {
    return false;
  }
  const lowered = path.toLowerCase();
  return (
    !lowered.startsWith("/login") &&
    !lowered.startsWith("/auth/") &&
    !lowered.startsWith("/oauth2") &&
    !lowered.startsWith("/saml2")
  );
}

function stashPostLoginRedirect(path: string): void {
  try {
    if (typeof window === "undefined" || !isSafePostLoginPath(path)) return;
    window.sessionStorage.setItem(POST_LOGIN_REDIRECT_STORAGE_KEY, path);
  } catch {
    // sessionStorage unavailable (e.g. private mode) — fail open
  }
}

/**
 * Handles HTTP errors with toast notifications and file error broadcasting
 * Returns true if the error should be suppressed (deduplicated), false otherwise
 */
export async function handleHttpError(error: any): Promise<boolean> {
  const skipAuthRedirect = error?.config?.skipAuthRedirect === true;
  // Check if this error should skip the global toast (component will handle it)
  if (error?.config?.suppressErrorToast === true) {
    return false; // Don't show global toast, but continue rejection
  }

  // Handle 401 authentication errors
  const status: number | undefined = error?.response?.status;
  if (status === 401) {
    const pathname = window.location.pathname;

    // Check if we're already on an auth page
    const isAuthPage =
      pathname.includes("/login") ||
      pathname.includes("/signup") ||
      pathname.includes("/auth/") ||
      pathname.includes("/invite/");

    // If not on auth page, redirect to login with expired session message
    if (!isAuthPage && !skipAuthRedirect) {
      console.debug("[httpErrorHandler] 401 detected, redirecting to login");
      // Store the current location so we can redirect back after login.
      // Use sessionStorage: Spring Security 302-strips query params from
      // /login, so `?from=` would be lost. Same-origin sessionStorage
      // survives the SAML/OAuth cross-origin round-trip because the callback
      // lands back on this origin before any other navigation.
      const currentLocation = window.location.pathname + window.location.search;
      stashPostLoginRedirect(currentLocation);
      // Keep the `?from=` query in the URL for observability/back-compat
      // even though it gets stripped; the authoritative value is sessionStorage.
      let hadStoredJwt = false;
      try {
        hadStoredJwt = Boolean(localStorage.getItem("stirling_jwt"));
      } catch {
        // ignore storage access failures
      }
      const expiredPrefix = hadStoredJwt ? "expired=true&" : "";
      window.location.href = `/login?${expiredPrefix}from=${encodeURIComponent(currentLocation)}`;
      return true; // Suppress toast since we're redirecting
    }

    // On auth pages, suppress the toast (user is already trying to authenticate)
    console.debug("[httpErrorHandler] Suppressing 401 on auth page:", pathname);
    return true;
  }

  if (handleSaaSError(error)) return true;

  // Compute title/body (friendly) from the error object
  const { title, body } = extractAxiosErrorMessage(error);

  // Normalize response data ONCE, reuse for both ID extraction and special-toast matching
  const raw = error?.response?.data as any;
  let normalized: unknown = raw;
  try {
    normalized = await normalizeAxiosErrorData(raw);
  } catch (e) {
    console.debug("normalizeAxiosErrorData", e);
  }

  // 1) If server sends structured file IDs for failures, also mark them errored in UI
  try {
    const ids = extractErrorFileIds(normalized);
    if (ids && ids.length > 0) {
      broadcastErroredFiles(ids);
    }
  } catch (e) {
    console.debug("extractErrorFileIds", e);
  }

  // 2) Generic-vs-special dedupe by endpoint
  const url: string | undefined = error?.config?.url;
  const now = Date.now();
  const isSpecial =
    status === 422 ||
    status === 409 || // often actionable conflicts
    /Failed files:/.test(body) ||
    /invalid\/corrupted file\(s\)/i.test(body);

  if (isSpecial && url) {
    recentSpecialByEndpoint[url] = now;
  }
  if (!isSpecial && url) {
    const last = recentSpecialByEndpoint[url] || 0;
    if (now - last < SPECIAL_SUPPRESS_MS) {
      return true; // Suppress this error (deduplicated)
    }
  }

  // 3) Show specialized friendly toasts if matched; otherwise show the generic one
  let rawString: string | undefined;
  try {
    rawString =
      typeof normalized === "string" ? normalized : JSON.stringify(normalized);
  } catch (e) {
    console.debug("extractErrorFileIds", e);
  }

  const handled = showSpecialErrorToast(rawString, { status });
  if (!handled) {
    const displayBody = clampText(body);
    alert({
      alertType: "error",
      title,
      body: displayBody,
      expandable: true,
      isPersistentPopup: false,
    });
  }

  return false; // Error was handled with toast, continue normal rejection
}
