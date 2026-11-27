import { BASE_PATH } from "@editor/constants/app";

/**
 * Desktop shadow: the fallback fonts ship inside the app bundle, so they load
 * from the webview's own origin rather than over HTTP from a backend. The API
 * base is deliberately ignored, since in server mode it points at a remote host.
 */
export function getFontBaseUrl(): string {
  return `${window.location.origin}${BASE_PATH}/fonts`;
}
