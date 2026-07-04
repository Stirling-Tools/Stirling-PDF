/**
 * Tracks how many signatures the user had already seen on each signing session
 * they own. Used to surface a badge when participants have signed a session
 * since the owner last opened it. Persisted in localStorage so "seen" survives
 * reloads; a module-level version counter lets hooks re-read reactively.
 */

const STORAGE_KEY = "stirling.signing.lastSeenSigned";

type SeenMap = Record<string, number>;

let version = 0;
const listeners = new Set<() => void>();

function read(): SeenMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SeenMap) : {};
  } catch {
    return {};
  }
}

/** Signed count the owner last saw for a session (0 if never opened). */
export function getLastSeenSignedCount(sessionId: string): number {
  return read()[sessionId] ?? 0;
}

/** Record the signed count the owner just saw for a session. */
export function markSessionSeen(sessionId: string, signedCount: number): void {
  try {
    const map = read();
    if (map[sessionId] === signedCount) return;
    map[sessionId] = signedCount;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage may be unavailable (private mode); badge degrades gracefully.
  }
  version += 1;
  listeners.forEach((listener) => listener());
}

/** Subscribe to "seen" changes (for useSyncExternalStore). */
export function subscribeSigningSeen(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Monotonic version, bumped whenever a session is marked seen. */
export function getSigningSeenVersion(): number {
  return version;
}
