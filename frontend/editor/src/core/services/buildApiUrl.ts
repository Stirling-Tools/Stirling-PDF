import { getApiBaseUrl } from "@app/services/apiClientConfig";

// Join the API base URL with a path for `fetch`, collapsing slashes so a "/"
// base doesn't produce "//api/..." (a protocol-relative URL pointing at host "api").
// getApiBaseUrl resolves per build via @app, so this works in web and desktop.
export function buildApiUrl(path: string): string {
  const base = (getApiBaseUrl() || "").replace(/\/+$/, "");
  return `${base}/${path.replace(/^\/+/, "")}`;
}
