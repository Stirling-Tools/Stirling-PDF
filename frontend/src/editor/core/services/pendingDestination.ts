import { isSafePostLoginRedirect } from "@app/services/postLoginRedirect";

/**
 * Remembers the in-app path a visitor was heading for, so an auth detour can return
 * them to it. The generic form of pendingConnect, which holds one connect request id.
 *
 * <p>localStorage, not sessionStorage: a confirmation email opens a new tab. Paths
 * are re-validated on read, since the guard may have tightened since the write.
 */
const KEY = "stirling-pending-destination";

/** Long enough for a confirmation email read the next morning. */
const TTL_MS = 24 * 60 * 60 * 1000;

interface Stored {
  path: string;
  at: number;
}

/** StrictMode mounts an effect twice; the second read must not change the decision. */
let taken: string | null | undefined;

/** Ignores anything the guard refuses, so callers may pass a raw query param. */
export function rememberPendingDestination(path: unknown): void {
  if (!isSafePostLoginRedirect(path)) return;
  try {
    const value: Stored = { path, at: Date.now() };
    window.localStorage.setItem(KEY, JSON.stringify(value));
    taken = undefined;
  } catch {
    // Private browsing or a full quota: the visitor lands on the default.
  }
}

export function clearPendingDestination(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Unwritable store; nothing to remove.
  }
}

/**
 * The remembered path, or null when absent, expired or no longer safe. Consumes it,
 * so an abandoned intent cannot redirect a later unrelated sign-in. Idempotent
 * within a page load.
 */
export function takePendingDestination(): string | null {
  if (taken !== undefined) return taken;
  taken = read();
  clearPendingDestination();
  return taken;
}

function read(): string | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Stored;
    if (typeof value?.at !== "number") return null;
    if (Date.now() - value.at > TTL_MS) return null;
    return isSafePostLoginRedirect(value.path) ? value.path : null;
  } catch {
    return null;
  }
}

/** Test seam: forget that this page load already took the intent. */
export function resetPendingDestinationForTests(): void {
  taken = undefined;
}
