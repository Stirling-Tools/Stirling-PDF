import { isSafePostLoginRedirect } from "@app/services/postLoginRedirect";

/**
 * Remembers the in-app path a visitor was trying to reach, so an auth detour can
 * return them to it.
 *
 * The generic form of pendingConnect: that one remembers a single connect request
 * id, this one remembers any router path. Most entry points that send a visitor
 * through auth are aimed somewhere specific — a sales link into the enterprise
 * flow, the portal gate bouncing a signed-out admin, a shared document — and each
 * one otherwise has to thread its own destination through every hop of sign-in and
 * sign-up.
 *
 * localStorage, not sessionStorage: a confirmation email opens a new tab, and
 * sessionStorage is per-tab, so it would be empty exactly when it is needed. This
 * is also why the destination is not carried in the email link itself — that only
 * survives if the mail client opens on the same device.
 *
 * Only a same-origin router path, validated on the way in and again on the way out
 * so a value written by an older build can never redirect off-origin. It decides
 * where a visitor lands, never what they may do once there.
 */
const KEY = "stirling-pending-destination";

/**
 * Long, because the round trip can include waiting on a confirmation email that is
 * read the next morning. Staleness is bounded by {@link takePendingDestination}
 * consuming the intent rather than by this window: an unconsumed destination can
 * only ever redirect one sign-in.
 */
const TTL_MS = 24 * 60 * 60 * 1000;

interface Stored {
  path: string;
  at: number;
}

/**
 * Set within a page load once the intent has been taken, so a second reader in the
 * same load sees the same answer instead of falling through to a default. React
 * mounts an effect twice under StrictMode, and the auth callback's redirect decision
 * must not change between the two.
 */
let taken: string | null | undefined;

/**
 * Remember where the visitor was heading. Ignores anything the post-login guard
 * would refuse, so a caller can pass a raw query param without pre-checking it.
 */
export function rememberPendingDestination(path: unknown): void {
  if (!isSafePostLoginRedirect(path)) return;
  try {
    const value: Stored = { path, at: Date.now() };
    window.localStorage.setItem(KEY, JSON.stringify(value));
    taken = undefined;
  } catch {
    // Private browsing or a full quota; the visitor just lands on the default.
  }
}

/** Drops the intent without reading it. */
export function clearPendingDestination(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Unwritable store; nothing to remove.
  }
}

/**
 * The remembered destination, or null when absent, expired or no longer safe.
 * Consumes it: a destination redirects one sign-in and then stops applying, so a
 * visitor who abandoned the journey is not pulled back into it on a later, unrelated
 * sign-in. Idempotent within a page load.
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
    // Re-checked rather than trusted: the guard may have tightened, or the entry
    // may predate it.
    return isSafePostLoginRedirect(value.path) ? value.path : null;
  } catch {
    return null;
  }
}

/** Test seam: forget that this page load already took the intent. */
export function resetPendingDestinationForTests(): void {
  taken = undefined;
}
