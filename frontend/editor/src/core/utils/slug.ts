/**
 * Turn a human label into a url/id-safe slug: lowercased, with every run of
 * non-alphanumerics collapsed to a single hyphen and leading/trailing hyphens
 * trimmed. May return an empty string (e.g. an all-symbol input); callers that
 * need a non-empty id should supply their own fallback.
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
