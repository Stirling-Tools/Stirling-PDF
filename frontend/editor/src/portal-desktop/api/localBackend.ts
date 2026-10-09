import { connectedServerBaseUrl } from "@app/services/connectedServerBaseUrl";

/**
 * Desktop: "this instance" is the connected server (Stirling Cloud or the
 * self-hosted server), never the bundled backend, which ships no processor
 * endpoints. An absolute base keeps the request out of the operation router's
 * local-first routing; the desktop interceptor attaches that server's token.
 */
export function localBaseUrl(): string {
  return connectedServerBaseUrl();
}

/** None: the desktop interceptor adds the connected server's own token. */
export async function localAuthHeader(): Promise<Record<string, string>> {
  return {};
}

/**
 * Nothing to do: by the time a 401 reaches here the interceptor has already
 * tried a refresh and, failing that, opened sign-in. Clearing the stored token
 * as the web does would sign desktop out of a session it still holds.
 */
export function onLocalUnauthorized(): void {}
