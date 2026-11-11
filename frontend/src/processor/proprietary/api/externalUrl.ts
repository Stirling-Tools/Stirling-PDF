/**
 * Open a URL that arrived from the API — a Stripe hosted-invoice page or invoice
 * PDF — in a new tab, after checking its scheme.
 *
 * These values are relayed from Stripe through our own edge functions, so they
 * are not attacker-controlled today. But a `javascript:` or `data:` URL reaching
 * a navigation sink is an XSS primitive, and nothing between Stripe and this call
 * promises the field can only ever hold a web address. Anything that is not plain
 * http(s) is dropped instead of opened.
 */
export function openApiUrl(url: string | null | undefined): void {
  if (!url) return;
  let parsed: URL;
  try {
    parsed = new URL(url, window.location.origin);
  } catch {
    console.warn("[portal] refusing to open an unparseable URL");
    return;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    console.warn(`[portal] refusing to open a ${parsed.protocol} URL`);
    return;
  }
  window.open(parsed.href, "_blank", "noopener,noreferrer");
}
