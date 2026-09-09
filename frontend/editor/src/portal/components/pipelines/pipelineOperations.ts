/**
 * Turn an endpoint path into a display label: take the last segment, drop the
 * "pdf"/"pdfs" filler words, and title-case the rest.
 * "/api/v1/misc/compress-pdf" → "Compress"; "/api/v1/security/auto-redact" →
 * "Auto Redact". Used as the fallback name for a stored step whose endpoint has
 * no tool in the registry to take a name from.
 */
export function humanizeOperation(path: string): string {
  const last = path.split("/").filter(Boolean).pop() ?? path;
  const words = last.split("-").filter((w) => w !== "pdf" && w !== "pdfs");
  const base = (words.length > 0 ? words : [last]).join(" ");
  return base.replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}
