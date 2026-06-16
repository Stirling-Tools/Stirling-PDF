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
import { withBasePath } from "@app/constants/app";

// Module-scoped state to reduce global variable usage
const recentSpecialByEndpoint: Record<string, number> = {};
const SPECIAL_SUPPRESS_MS = 1500; // brief window to suppress generic duplicate after special toast

// Mirrors the key in proprietary/auth/springAuthClient.ts; AuthCallback consumes it.
const POST_LOGIN_REDIRECT_STORAGE_KEY = "stirling_post_login_path";

function isSafePostLoginPath(path: string): boolean {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.startsWith("/\\")
  ) {
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
    // sessionStorage unavailable (private mode) — fail open
  }
}

// Loop breaker: a second 401 redirect within this window means the login page
// bounced us back with a live session — redirecting again would loop forever.
const LOGIN_REDIRECT_THROTTLE_KEY = "stirling_last_401_redirect";
const LOGIN_REDIRECT_THROTTLE_MS = 10_000;

function loginRedirectRecentlyFired(): boolean {
  try {
    const last = Number(
      window.sessionStorage.getItem(LOGIN_REDIRECT_THROTTLE_KEY),
    );
    return (
      Number.isFinite(last) && Date.now() - last < LOGIN_REDIRECT_THROTTLE_MS
    );
  } catch {
    return false;
  }
}

function markLoginRedirectFired(): void {
  try {
    window.sessionStorage.setItem(
      LOGIN_REDIRECT_THROTTLE_KEY,
      String(Date.now()),
    );
  } catch {
    // sessionStorage unavailable — fail open
  }
}

// Reset the throttle when the user establishes a fresh session via interactive
// login. Otherwise a genuine expiry that happens within the throttle window of
// the redirect that sent them to /login would be wrongly suppressed, leaving
// them on a page with silently failing requests. Login dispatches
// "jwt-available"; token refresh does not (it fires "TOKEN_REFRESHED"), so
// refresh-driven redirect churn is still dampened by the throttle.
if (typeof window !== "undefined") {
  window.addEventListener("jwt-available", () => {
    try {
      window.sessionStorage.removeItem(LOGIN_REDIRECT_THROTTLE_KEY);
    } catch {
      // sessionStorage unavailable - nothing to clear
    }
  });
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
      if (loginRedirectRecentlyFired()) {
        console.warn(
          "[httpErrorHandler] 401 redirect already fired moments ago — suppressing repeat to avoid a login loop:",
          error?.config?.url,
        );
        return true;
      }
      console.debug("[httpErrorHandler] 401 detected, redirecting to login");
      // Spring 302-strips the ?from= query from /login, so stash the return
      // path in sessionStorage (AuthCallback reads it after SSO round-trip).
      const currentLocation = window.location.pathname + window.location.search;
      stashPostLoginRedirect(currentLocation);
      let hadStoredJwt = false;
      try {
        hadStoredJwt = Boolean(localStorage.getItem("stirling_jwt"));
      } catch {
        // ignore storage access failures
      }
      const expiredPrefix = hadStoredJwt ? "expired=true&" : "";
      markLoginRedirectFired();
      window.location.href = `${withBasePath("/login")}?${expiredPrefix}from=${encodeURIComponent(currentLocation)}`;
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
