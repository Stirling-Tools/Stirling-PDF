import axios from "axios";
import { supabase } from "@app/auth/supabase";
import { handleHttpError } from "@app/services/httpErrorHandler";
import { alert } from "@app/components/toast";
import { openPlanSettings } from "@app/utils/appSettings";

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
  "/api/v1/config/endpoints-enabled",
];

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
    const originalRequest = error.config;
    const isPublicEndpoint = publicEndpoints.some((endpoint) =>
      originalRequest.url?.includes(endpoint),
    );

    // If we get a 401 and haven't already tried to refresh, and it's not a public endpoint
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isPublicEndpoint
    ) {
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
          } = await supabase.auth.refreshSession();

          if (refreshError) {
            console.error("[API Client] Token refresh failed:", refreshError);

            // Only redirect to login for protected endpoints, not public ones
            const isPublicEndpoint =
              originalRequest.url?.includes("/api/v1/config/") ||
              originalRequest.url?.includes("/api/v1/info/");

            if (!isPublicEndpoint) {
              // Redirect to login only for protected endpoints
              window.location.href = "/login";
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
        } else {
          // No session exists, only redirect if not already on login page
          console.debug(
            "[API Client] No session to refresh, 401 on protected endpoint",
          );
          if (window.location.pathname !== "/login") {
            window.location.href = "/login";
          }
        }
      } catch (refreshError) {
        console.error("[API Client] Error during token refresh:", refreshError);
      }
    }

    // For public endpoints with 401, just log and continue (don't redirect)
    if (isPublicEndpoint && error.response?.status === 401) {
      console.debug(
        "[API Client] 401 on public endpoint, continuing without auth:",
        originalRequest.url,
      );
    }
    const status = error.response?.status;
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
