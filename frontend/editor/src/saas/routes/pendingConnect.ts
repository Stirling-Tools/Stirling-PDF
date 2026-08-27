/**
 * Remembers that the visitor arrived wanting to connect a server, so a sign-in
 * detour can return them to the approval page.
 *
 * localStorage, not sessionStorage: the confirmation email opens a new tab, and
 * sessionStorage is per-tab — empty exactly when it is needed.
 *
 * Only the request id, which is already in the URL and carries no secret. This
 * decides where the approver lands, never whether the link happens.
 *
 * Reading does not consume it: the request may be open in another tab, or the page
 * closed and reopened, or the reader mounted twice. Only a recorded decision, or a
 * request that is settled or gone, retires it.
 */
const KEY = "stirling-pending-connect";

/** Matches the server's request lifetime, so a stale intent cannot hijack a later sign-in. */
const TTL_MS = 30 * 60 * 1000;

interface Stored {
  requestId: string;
  at: number;
}

export function rememberPendingConnect(requestId: string): void {
  try {
    const value: Stored = { requestId, at: Date.now() };
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Private browsing or a full quota; nothing to fall back to.
  }
}

/** Drops the intent without reading it, once it has been acted on. */
export function clearPendingConnect(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Unwritable store; nothing to remove.
  }
}

/** The pending request, or null when absent or expired. Leaves it in place. */
export function readPendingConnect(): string | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Stored;
    if (typeof value?.requestId !== "string" || typeof value?.at !== "number") {
      clearPendingConnect();
      return null;
    }
    if (Date.now() - value.at > TTL_MS) {
      clearPendingConnect();
      return null;
    }
    return value.requestId;
  } catch {
    return null;
  }
}
