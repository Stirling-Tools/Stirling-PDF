import { connectedServerBaseUrl } from "@app/services/connectedServerBaseUrl";

/** Desktop: the AI engine lives on the connected server, never on the bundled backend. Absolute
 *  because one consumer is a raw fetch, where a relative path would hit the webview origin. */
export function getAiBaseUrl(): string {
  return connectedServerBaseUrl();
}
