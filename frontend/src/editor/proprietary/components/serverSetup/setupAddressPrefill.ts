import { withBasePath } from "@editor/constants/app";

/** The address setup offers for the server: this page's origin, or empty when
 *  the page isn't served over http(s). */
export function setupAddressPrefill(): string {
  if (!/^https?:$/.test(window.location.protocol)) return "";
  return `${window.location.origin}${withBasePath("/")}`.replace(/\/+$/, "");
}
