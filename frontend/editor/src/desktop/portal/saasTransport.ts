import { fetch } from "@tauri-apps/plugin-http";

/**
 * Native HTTP straight to Stirling Cloud, carrying the caller's Authorization.
 * Not the desktop apiClient: in self-hosted mode its interceptor replaces the
 * header with the server's Spring token, and these calls need the Stirling
 * account's own token.
 */
export function saasFetch(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, init);
}
