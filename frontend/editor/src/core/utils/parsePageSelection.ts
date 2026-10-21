/** A parsed 1-based page selection, or why it could not be parsed. */
export type PageSelection =
  | { ok: true; pages: number[] }
  | { ok: false; reason: "empty" | "token" | "out-of-range"; value?: string };

/**
 * Parses `1,3,5-9` / `all` into the 1-based pages it names. Ranges include both
 * ends. Anything else — the `2n+1` expressions the API accepts — is reported as
 * unparseable rather than guessed at.
 */
export function parsePageSelection(
  input: string,
  totalPages: number,
): PageSelection {
  const text = input.trim();
  if (!text) return { ok: false, reason: "empty" };
  if (/^all$/i.test(text)) {
    return { ok: true, pages: range(1, totalPages) };
  }

  const pages = new Set<number>();
  for (const rawToken of text.split(",")) {
    const token = rawToken.trim();
    if (!token) continue;

    const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const from = Number(rangeMatch[1]);
      const to = Number(rangeMatch[2]);
      if (from < 1 || to < from) {
        return { ok: false, reason: "token", value: token };
      }
      if (to > totalPages) {
        return { ok: false, reason: "out-of-range", value: token };
      }
      for (const page of range(from, to)) pages.add(page);
      continue;
    }

    if (!/^\d+$/.test(token)) {
      return { ok: false, reason: "token", value: token };
    }
    const page = Number(token);
    if (page < 1) return { ok: false, reason: "token", value: token };
    if (page > totalPages) {
      return { ok: false, reason: "out-of-range", value: token };
    }
    pages.add(page);
  }

  if (pages.size === 0) return { ok: false, reason: "empty" };
  return { ok: true, pages: [...pages].sort((a, b) => a - b) };
}

function range(from: number, to: number): number[] {
  if (to < from) return [];
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}
