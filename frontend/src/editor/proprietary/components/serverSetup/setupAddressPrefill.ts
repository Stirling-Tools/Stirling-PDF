import { withBasePath } from "@editor/constants/app";

/**
 * The address setup offers for the server's web and server address fields:
 * where this page is served from. Empty where the page is not served over
 * http(s), so there is nothing to offer.
 */
export function setupAddressPrefill(): string {
  if (!/^https?:$/.test(window.location.protocol)) return "";
  return `${window.location.origin}${withBasePath("/")}`.replace(/\/+$/, "");
}
