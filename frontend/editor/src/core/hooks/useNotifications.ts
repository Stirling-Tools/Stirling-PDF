import { useSyncExternalStore } from "react";
import {
  fetchNotifications,
  type AppNotification,
} from "@app/services/notifications";
import { hasLocalFile } from "@app/services/localFilePresence";

/**
 * One polled store for however many bells are mounted. A module store rather than a context because
 * the portal mounts its bell as a sibling of AppProviders, so there is no single tree to provide in.
 */

// TODO: read state is per-browser. Move it server-side when notifications get their own table.
const POLL_INTERVAL_MS = 30_000;
const SEEN_STORAGE_KEY_PREFIX = "stirling.notifications.readThroughAt";

/**
 * Scoped to the viewer the server named, because a timestamp is legible to whoever reads it next: an
 * unscoped marker left by the previous user of a shared browser would silently pre-read the
 * incoming user's older failures. Null while the viewer is unknown, which reads as nothing marked.
 */
function seenStorageKey(viewerKey: string | null): string | null {
  return viewerKey ? `${SEEN_STORAGE_KEY_PREFIX}.${viewerKey}` : null;
}

/** A time, not an id: an id points at nothing once its row leaves the list. */
function orderedAt(notification: AppNotification): number {
  return Date.parse(notification.lastSeenAt);
}

function readReadThrough(viewerKey: string | null): number | null {
  const key = seenStorageKey(viewerKey);
  if (!key) return null;
  try {
    const stored = Number(window.localStorage.getItem(key));
    return Number.isFinite(stored) && stored > 0 ? stored : null;
  } catch {
    // Private mode: everything reads as unseen, which errs towards showing failures.
    return null;
  }
}

function writeReadThrough(viewerKey: string | null, at: number): void {
  const key = seenStorageKey(viewerKey);
  // Unscoped would be worse than unsaved: the next viewer here would inherit it.
  if (!key) return;
  try {
    window.localStorage.setItem(key, String(at));
  } catch {
    // The marker just will not survive a reload.
  }
}

/**
 * Forget how far the departing reader got. The marker is scoped to its viewer, so this is belt to
 * that brace: it also covers a sign-out on a build where the server names no viewer, and it drops
 * the in-memory marker so the bell does not answer for them until the next read says who is here.
 */
export function clearNotificationReadState(): void {
  const key = seenStorageKey(snapshot.viewerKey);
  if (key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing to clear that a read could trust anyway.
    }
  }
  publish({ ...snapshot, readThroughAt: null, viewerKey: null });
}

export interface NotificationDocumentState {
  hasLocalFile: boolean;
}

const NO_DOCUMENT: NotificationDocumentState = {
  hasLocalFile: false,
};

/**
 * Whether this browser could resolve the document a row names. Two id spaces share `fileId`: an
 * attended run reports the id its editor minted, a source-fed one a hash that was never on a device.
 */
export function isResolvableHere(notification: AppNotification): boolean {
  return (notification.sourceId ?? null) === null;
}

interface NotificationsSnapshot {
  notifications: AppNotification[];
  /** Keyed by fileId, so several rows about one document cost one lookup. */
  documents: Record<string, NotificationDocumentState>;
  /** Everything up to and including this time has been read. Epoch millis, never a row id. */
  readThroughAt: number | null;
  /** Who the marker belongs to. Null until a read says, so nothing is marked on their behalf. */
  viewerKey: string | null;
}

const NOTHING_LOADED: NotificationsSnapshot = {
  notifications: [],
  documents: {},
  readThroughAt: null,
  viewerKey: null,
};

let snapshot: NotificationsSnapshot = NOTHING_LOADED;
const subscribers = new Set<() => void>();
let pollTimer: number | null = null;
let inFlight: Promise<void> | null = null;
/** Bumped when polling starts or stops, so a read from a finished cycle cannot write. */
let cycle = 0;
let notifyQueued = false;

function getSnapshot(): NotificationsSnapshot {
  return snapshot;
}

/**
 * Subscribers told on a microtask: a bell marks the list read from inside its own state updater, and
 * re-rendering the others from there is the render-phase update React refuses.
 */
function publish(next: NotificationsSnapshot): void {
  snapshot = next;
  if (notifyQueued) return;
  notifyQueued = true;
  queueMicrotask(() => {
    notifyQueued = false;
    subscribers.forEach((notify) => notify());
  });
}

async function read(forCycle: number): Promise<void> {
  const {
    notifications: listed,
    viewerReviewsTeam,
    viewerKey,
  } = await fetchNotifications();
  if (forCycle !== cycle) return;

  const fileIds = [
    ...new Set(
      listed
        .filter(isResolvableHere)
        .map((notification) => notification.fileId)
        .filter((fileId): fileId is string => fileId !== null),
    ),
  ];
  const resolved = await Promise.all(
    fileIds.map(
      async (fileId) =>
        [
          fileId,
          {
            hasLocalFile: await hasLocalFile(fileId),
          },
        ] as const,
    ),
  );
  if (forCycle !== cycle) return;

  const documents = Object.fromEntries(resolved);
  // Presentation, not access: the server has already scoped these rows to the reader. Hidden
  // because every offer a member gets needs the document, so the row would only say so.
  const visible = viewerReviewsTeam
    ? listed
    : listed.filter(
        // Asked rather than left to the lookup missing: an unattended row's fileId comes from
        // another id space, so a hit on one would be a collision and not the document.
        (n) =>
          isResolvableHere(n) &&
          Boolean(n.fileId && documents[n.fileId]?.hasLocalFile),
      );

  // Read per read, not once at startup: the marker belongs to whoever the server says is
  // reading, and signing in or out changes who that is without remounting the bell.
  publish({
    ...snapshot,
    notifications: visible,
    documents,
    viewerKey,
    readThroughAt: readReadThrough(viewerKey),
  });
}

/** A caller arriving mid-read joins the one already running. */
function load(): Promise<void> {
  if (inFlight) return inFlight;
  const pending = read(cycle).finally(() => {
    if (inFlight === pending) inFlight = null;
  });
  inFlight = pending;
  return pending;
}

/** Set while a fresh read is chained behind the one in flight, so callers share it. */
let freshReadQueued = false;

/**
 * A read that must observe a write the caller just made. It never joins a read already in
 * flight, because that read may have started before the write and would report the world
 * without it; a fresh read is chained behind it instead. Callers arriving in the same
 * window share the one chained read.
 */
function loadFresh(): void {
  const inFlightRead = inFlight;
  if (!inFlightRead) {
    void load();
    return;
  }
  if (freshReadQueued) return;
  freshReadQueued = true;
  void inFlightRead.finally(() => {
    freshReadQueued = false;
    // The last bell may have unmounted while the stale read was landing.
    if (subscribers.size === 0) return;
    void load();
  });
}

function startPolling(): void {
  cycle += 1;
  // Nothing read until the first read names the viewer, since the marker is theirs and not this
  // browser's. Everything counts as unread until then, which errs towards showing failures.
  snapshot = NOTHING_LOADED;
  pollTimer = window.setInterval(() => void load(), POLL_INTERVAL_MS);
  void load();
}

function stopPolling(): void {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
  // Drop anything in flight: its cycle has nobody watching it.
  cycle += 1;
  inFlight = null;
  snapshot = NOTHING_LOADED;
}

/** Polling lives exactly as long as there is a bell to show it. */
function subscribe(onStoreChange: () => void): () => void {
  subscribers.add(onStoreChange);
  if (subscribers.size === 1) startPolling();
  return () => {
    subscribers.delete(onStoreChange);
    if (subscribers.size === 0) stopPolling();
  };
}

function markAllSeen(): void {
  // The newest time in the list, not the first row's, so a re-sorted list cannot under-mark.
  const newest = Math.max(
    ...snapshot.notifications.map(orderedAt).filter(Number.isFinite),
  );
  if (!Number.isFinite(newest)) return;
  if (snapshot.readThroughAt !== null && newest <= snapshot.readThroughAt)
    return;
  writeReadThrough(snapshot.viewerKey, newest);
  publish({ ...snapshot, readThroughAt: newest });
}

function refresh(): void {
  // A row calls this after changing something server-side, so the read must be fresh.
  loadFresh();
}

/**
 * Re-read now, for a caller that just caused a notification: without it the person who triggered a
 * failure waits a whole poll interval to hear about their own action. A no-op with no bell mounted.
 */
export function refreshNotificationsNow(): void {
  if (subscribers.size === 0) return;
  loadFresh();
}

export interface NotificationsState {
  notifications: AppNotification[];
  /** Read before {@link markAllSeen}, which zeroes it. */
  unreadCount: number;
  documentStateFor: (
    notification: AppNotification,
  ) => NotificationDocumentState;
  markAllSeen: () => void;
  refresh: () => void;
}

export function useNotifications(): NotificationsState {
  const { notifications, documents, readThroughAt } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  );

  // A resolved row leaves without dragging the rest back into unread. Unparseable counts as new.
  const unreadCount =
    readThroughAt === null
      ? notifications.length
      : notifications.filter((n) => !(orderedAt(n) <= readThroughAt)).length;

  return {
    notifications,
    unreadCount,
    documentStateFor: (notification) =>
      (notification.fileId ? documents[notification.fileId] : null) ??
      NO_DOCUMENT,
    markAllSeen,
    refresh,
  };
}
