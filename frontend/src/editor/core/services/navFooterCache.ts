/**
 * Last-known sidebar-footer state, so the rows are correct at first paint
 * instead of arriving a request later.
 *
 * The footer is mounted by both apps, and the editor and processor are separate
 * React trees with separate query caches — so without this, every navigation
 * between them (and every remount inside them) re-ran the fetches and the rows
 * visibly popped in and shoved each other around. Persisting to storage rather
 * than to an in-memory cache is what makes it survive that boundary, and a
 * reload.
 *
 * Deliberately stale-then-revalidate: what's stored is only ever what the
 * backend last said, every reader refetches immediately and overwrites, and
 * nothing is gated on it — the processor enforces its own access server-side,
 * and a stale credit figure is replaced within a second of the wallet landing.
 */
const CREDITS_KEY = "stirling.navFooter.credits";
const OTHER_APP_KEY = "stirling.navFooter.otherApp";

/** Figures, or null for a team that sees no meter at all (a paying one). */
export type CachedCredits = { remaining: number; total: number } | null;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Private mode / storage disabled — behave as a first-ever load.
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Nothing to do: the cache is an optimisation, never a correctness input.
  }
}

/** `undefined` when this browser has never seen an answer. */
export function readCachedCredits(): CachedCredits | undefined {
  const raw = read(CREDITS_KEY);
  if (raw === null) return undefined;
  if (raw === "none") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as CachedCredits & object).remaining === "number" &&
      typeof (parsed as CachedCredits & object).total === "number"
    ) {
      return parsed as CachedCredits;
    }
  } catch {
    // Corrupt entry — fall through and treat it as never-seen.
  }
  return undefined;
}

export function writeCachedCredits(credits: CachedCredits): void {
  write(CREDITS_KEY, credits === null ? "none" : JSON.stringify(credits));
}

/** `undefined` when this browser has never seen an answer. */
export function readCachedOtherApp(): boolean | undefined {
  const raw = read(OTHER_APP_KEY);
  return raw === null ? undefined : raw === "true";
}

export function writeCachedOtherApp(canOpen: boolean): void {
  write(OTHER_APP_KEY, String(canOpen));
}
