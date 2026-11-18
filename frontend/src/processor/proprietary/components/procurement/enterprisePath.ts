/**
 * The Enterprise page: trial, quote, agreement and licence, outside the app's own chrome.
 * Self-hosted builds forward it to the hosted page.
 */
export const ENTERPRISE_PATH = "/enterprise";

/** An older address for the page. Sales emails and campaigns still link to it, so it redirects. */
export const LEGACY_ENTERPRISE_PATH = "/procurement";

/**
 * Where a billing link that set out to start the Enterprise trial (`?procurement=start`, sent in
 * sales emails) now leads, keeping its other parameters; null for any other billing link.
 */
export function legacyProcurementTarget(search: string): string | null {
  const params = new URLSearchParams(search);
  if (params.get("procurement") !== "start") return null;
  params.delete("procurement");
  const rest = params.toString();
  return rest ? `${ENTERPRISE_PATH}?${rest}` : ENTERPRISE_PATH;
}
