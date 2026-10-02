import { isSigningItemClosed, type SigningItem } from "@app/utils/signingItems";

const STORAGE_PREFIX = "stirling.signing.seenActivity.";

interface SeenActivity {
  signedCount: number;
  decisions: string[];
}

let version = 0;
const listeners = new Set<() => void>();
const memory = new Map<string, SeenActivity>();
const failedWrites = new Set<string>();

function storageKey(accountId: string, item: SigningItem): string {
  return (
    STORAGE_PREFIX + JSON.stringify([accountId, item.kind, item.sessionId])
  );
}

function snapshot(item: SigningItem): SeenActivity {
  return item.kind === "request"
    ? { signedCount: 0, decisions: [] }
    : {
        signedCount: item.signedCount,
        decisions: (item.participants ?? [])
          .filter(
            (participant) =>
              participant.status === "SIGNED" ||
              participant.status === "DECLINED",
          )
          .map((participant) =>
            JSON.stringify([
              participant.id,
              participant.status,
              participant.lastUpdated,
            ]),
          )
          .sort(),
      };
}

function read(key: string): SeenActivity | undefined {
  if (failedWrites.has(key)) return memory.get(key);
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (
      value &&
      typeof value === "object" &&
      "signedCount" in value &&
      typeof value.signedCount === "number" &&
      "decisions" in value &&
      Array.isArray(value.decisions) &&
      value.decisions.every((entry) => typeof entry === "string")
    ) {
      return { signedCount: value.signedCount, decisions: value.decisions };
    }
    return undefined;
  } catch {
    return memory.get(key);
  }
}

function notify(): void {
  version += 1;
  listeners.forEach((listener) => listener());
}

/** Unread means an unseen invitation or participant decision, not an unfinished signing task. */
export function hasUnseenSigningActivity(
  accountId: string | null,
  item: SigningItem,
): boolean {
  if (!accountId || isSigningItemClosed(item)) return false;
  const seen = read(storageKey(accountId, item));
  if (item.kind === "request") {
    return (
      !seen && (item.myStatus === "PENDING" || item.myStatus === "NOTIFIED")
    );
  }
  const current = snapshot(item);
  return (
    Boolean(
      item.ownRequest &&
      hasUnseenSigningActivity(accountId, {
        ...item.ownRequest,
        kind: "request",
      }),
    ) ||
    current.signedCount > (seen?.signedCount ?? 0) ||
    current.decisions.some((decision) => !seen?.decisions.includes(decision))
  );
}

/** Call after showing the detail or its access-expiry notice. Persist no document names, emails or credentials. */
export function markSigningItemSeen(
  accountId: string | null,
  item: SigningItem,
): void {
  if (!accountId) return;
  if (item.kind === "session" && item.ownRequest) {
    markSigningItemSeen(accountId, { ...item.ownRequest, kind: "request" });
  }
  const key = storageKey(accountId, item);
  const current = snapshot(item);
  const previous = read(key);
  // A stale list/response must not resurrect a decision that was already reviewed.
  const next = {
    signedCount: Math.max(previous?.signedCount ?? 0, current.signedCount),
    decisions: [
      ...new Set([...(previous?.decisions ?? []), ...current.decisions]),
    ].sort(),
  };
  if (JSON.stringify(previous) === JSON.stringify(next)) return;
  memory.set(key, next);
  try {
    localStorage.setItem(key, JSON.stringify(next));
    failedWrites.delete(key);
  } catch {
    // Private-mode storage failures retain read state for this app session.
    failedWrites.add(key);
  }
  notify();
}

function onStorage(event: StorageEvent): void {
  if (event.key === null || event.key.startsWith(STORAGE_PREFIX)) {
    memory.clear();
    failedWrites.clear();
    notify();
  }
}

/** Includes read acknowledgements from other tabs on the same origin. */
export function subscribeSigningSeen(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

/** Changes when local or cross-tab read state changes; used by useSyncExternalStore. */
export function getSigningSeenVersion(): number {
  return version;
}
