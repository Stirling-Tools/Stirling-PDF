/**
 * Transport behind {@code apiClient.local} — issues the request and returns the
 * raw Response for the caller to unwrap.
 *
 * <p>A seam because the browser's fetch is not available everywhere the roster
 * runs: the desktop build shadows this to go through its native HTTP client,
 * which resolves the backend for the current connection mode and is not subject
 * to the webview's origin checks. Callers pass a path already joined to
 * {@code localBaseUrl()}.
 */
export function localFetch(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, init);
}
