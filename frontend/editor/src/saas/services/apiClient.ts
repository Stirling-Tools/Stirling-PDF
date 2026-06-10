import axios from "axios";
import { supabase } from "@app/auth/supabase";
import { handleHttpError } from "@app/services/httpErrorHandler";
import { alert } from "@app/components/toast";
import { openPlanSettings } from "@app/utils/appSettings";
import { withBasePath } from "@app/constants/app";

// Global credit update callback - will be set by the AuthProvider
let globalCreditUpdateCallback: ((credits: number) => void) | null = null;

// Function to set the global credit update callback
export const setGlobalCreditUpdateCallback = (
  callback: (credits: number) => void,
) => {
  globalCreditUpdateCallback = callback;
};

// Helper: decode base64url JWT payload safely
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );
    const json =
      typeof atob !== "undefined"
        ? atob(padded)
        : Buffer.from(padded, "base64").toString("binary");
    return JSON.parse(json);
  } catch (e) {
    console.warn("[API Client] Failed to decode JWT payload:", e);
    return null;
  }
}

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  responseType: "json",
});

const LOW_CREDIT_THRESHOLD = 10;
function notifyLowCredits(credits: number) {
  const title = "Credit balance low";
  const body = `You have ${credits} credits remaining.`;
  alert({
    alertType: "warning",
    title,
    body,
    buttonText: "Top up",
    buttonCallback: () => openPlanSettings(),
    isPersistentPopup: true,
    location: "bottom-right",
  });
}
// Request interceptor to add JWT token to all requests
apiClient.interceptors.request.use(
  async (config) => {
    try {
      // Get the current session from Supabase
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        console.error("[API Client] Error getting session:", error);
      }

      // If we have a session with an access token, add it to the Authorization header
      if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`;
        const payload = decodeJwtPayload(session.access_token);
        const role =
          (payload?.["role"] as string) ||
          (payload?.["user_role"] as string) ||
          undefined;
        const aud = payload?.["aud"] as string | undefined;
        const isAnon = role === "anon" || aud === "anon";

        // Debug logs for visibility during integration
        if (import.meta.env.DEV) {
          console.debug("[API Client] Added JWT token to request:", config.url);
          console.debug("[API Client] JWT payload:", payload);
          console.debug(
            "[API Client] Token role:",
            role,
            "| aud:",
            aud,
            "| isAnon:",
            isAnon,
          );
        }
      } else {
        console.debug(
          "[API Client] No JWT token available for request:",
          config.url,
        );
      }
    } catch (error) {
      console.error("[API Client] Error in request interceptor:", error);
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// List of endpoints that don't require authentication
const publicEndpoints = [
  "/api/v1/config/app-config",
  "/api/v1/info/status",
  "/api/v1/config/public-config",
  // Both real endpoint-config routes (an earlier entry here said
  // "endpoints-enabled", which matches neither and silently guarded nothing).
  "/api/v1/config/endpoints-availability",
  "/api/v1/config/endpoint-enabled",
];

// De-duplicate concurrent token refreshes.
//
// On a cold load with an expired access token, many bootstrap requests
// (config, credits, footer-info, storage, ...) 401 at roughly the same
// instant. If each one calls supabase.auth.refreshSession() independently,
// Supabase rotates the refresh token on first use and the remaining
// concurrent refreshes fail with "Invalid Refresh Token: Already Used".
// That spurious failure then bounced the whole app to /login even though the
// session was perfectly recoverable. Sharing a single in-flight refresh
// promise makes the first 401 do the network refresh and everyone else awaits
// the same result.
let inFlightRefresh: ReturnType<typeof supabase.auth.refreshSession> | null =
  null;
function refreshSessionOnce(): ReturnType<typeof supabase.auth.refreshSession> {
  if (!inFlightRefresh) {
    inFlightRefresh = supabase.auth.refreshSession().finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

// Response interceptor for handling token refresh and credit updates
apiClient.interceptors.response.use(
  (response) => {
    // Check for X-Credits-Remaining header and update credits automatically
    const creditsRemaining = response.headers["x-credits-remaining"];
    if (creditsRemaining && globalCreditUpdateCallback) {
      const credits = parseInt(creditsRemaining, 10);
      if (!isNaN(credits) && credits >= 0) {
        console.debug(
          "[API Client] Updating credits from response header:",
          credits,
          "for URL:",
          response.config?.url,
        );
        globalCreditUpdateCallback(credits);
        // Show low-credit toast with top-up button when below threshold
        if (credits < LOW_CREDIT_THRESHOLD) {
          notifyLowCredits(credits);
        }
      } else {
        console.warn(
          "[API Client] Invalid credits value in response header:",
          creditsRemaining,
        );
      }
    }
    if (response.config?.url?.includes("/api/v1/credits")) {
      console.debug(
        "[API Client] Credits endpoint response headers:",
        response.headers,
      );
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config || {};
    const status = error.response?.status;
    const isPublicEndpoint = publicEndpoints.some((endpoint) =>
      originalRequest.url?.includes(endpoint),
    );

    // On a 401 (that we haven't already retried), try to recover the session
    // before giving up. We attempt this for BOTH protected and public
    // endpoints: the backend rejects any expired Bearer token regardless of
    // route, so a "public" bootstrap call (e.g. /api/v1/config/app-config) can
    // 401 on cold load too. Refreshing + retrying lets those succeed instead of
    // tripping the global login redirect.
    if (status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Check if we have a session to refresh
        const {
          data: { session },
        } = await supabase.auth.getSession();

        // Only try to refresh if we actually have a session
        if (session) {
          const {
            data: { session: refreshedSession },
            error: refreshError,
          } = await refreshSessionOnce();

          if (refreshError) {
            console.error("[API Client] Token refresh failed:", refreshError);

            // The session genuinely can't be recovered. Send protected requests
            // to login; public ones just fail quietly (no redirect).
            if (!isPublicEndpoint) {
              window.location.href = withBasePath("/login");
            }

            return Promise.reject(error);
          }

          if (refreshedSession?.access_token) {
            // Update the Authorization header with the new token
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${refreshedSession.access_token}`;
            console.debug("[API Client] Retrying request with refreshed token");

            // Retry the original request with the new token
            return apiClient(originalRequest);
          }
        } else if (!isPublicEndpoint) {
          // No session exists on a protected endpoint, only redirect if not
          // already on the login page.
          console.debug(
            "[API Client] No session to refresh, 401 on protected endpoint",
          );
          const loginPath = withBasePath("/login");
          if (window.location.pathname !== loginPath) {
            window.location.href = loginPath;
          }
          return Promise.reject(error);
        }
      } catch (refreshError) {
        console.error("[API Client] Error during token refresh:", refreshError);
      }
    }

    // A 401 on a public endpoint must never trigger the global login redirect.
    // If we reach here it means refresh/retry didn't resolve it (e.g. no
    // session yet, or it 401'd again); suppress the redirect in the shared
    // error handler so a transient bootstrap 401 can't bounce the app to
    // /login while Supabase is still restoring the session.
    if (status === 401 && isPublicEndpoint) {
      console.debug(
        "[API Client] 401 on public endpoint, continuing without auth:",
        originalRequest.url,
      );
      originalRequest.skipAuthRedirect = true;
    }

    // If a request was already retried with a freshly refreshed token and the
    // backend STILL returned 401, the session is not the problem — the backend
    // is rejecting a valid token (authorization bug, wrong API origin, etc.).
    // Redirecting to /login cannot fix that: the login page sees the valid
    // Supabase session and bounces straight back, producing an infinite
    // login -> / -> login loop. Keep the error toast, skip the redirect.
    if (status === 401 && originalRequest._retry && !isPublicEndpoint) {
      console.warn(
        "[API Client] 401 persisted after token refresh; backend rejected a valid session — not redirecting to login:",
        originalRequest.url,
      );
      originalRequest.skipAuthRedirect = true;
    }
    const url = error.config?.url;
    const method = error.config?.method?.toUpperCase();

    console.error("[API Client] HTTP Error", {
      status,
      method,
      url,
      error: error.message,
      data: error.response?.data,
    });
    await handleHttpError(error); // Handle error (shows toast unless suppressed)

    return Promise.reject(error);
  },
);

export default apiClient;
