/**
 * Default HTTP transport for the shared auth engine.
 *
 * The editor injects its own richer axios instance (with platform routing,
 * error toasts, credit headers, ...) via {@link configureSpringAuth}. Apps that
 * don't have one - notably the portal - fall back to this minimal client, which
 * attaches the `stirling_jwt` bearer token so the portal and editor share a
 * single same-origin session.
 */
import axios, { type AxiosInstance } from "axios";

/** localStorage key holding the Spring JWT. Shared so portal + editor agree. */
export const JWT_STORAGE_KEY = "stirling_jwt";

export function getStoredToken(): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(JWT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(JWT_STORAGE_KEY, token);
    }
  } catch {
    // localStorage unavailable (private mode) - fail open
  }
}

export function clearStoredToken(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(JWT_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

/**
 * Create the fallback transport. `baseURL` defaults to "/" so it targets the
 * same origin that served the SPA - the backend serves both portal and editor,
 * so the cookie/token domain is shared.
 */
export function createDefaultHttpClient(baseURL = "/"): AxiosInstance {
  const client = axios.create({
    baseURL,
    responseType: "json",
    withCredentials: true,
  });

  client.interceptors.request.use((config) => {
    const token = getStoredToken();
    if (token) {
      config.headers = config.headers ?? {};
      // Respect an explicit Authorization header (e.g. /auth/me passes the
      // candidate token directly); only fill it in when absent.
      if (!config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  });

  return client;
}
