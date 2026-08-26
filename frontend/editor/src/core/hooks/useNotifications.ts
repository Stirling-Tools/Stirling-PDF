import { useSyncExternalStore } from "react";
import {
  fetchNotifications,
  type AppNotification,
} from "@app/services/notifications";
import { hasLocalFile } from "@app/services/localFilePresence";

/**
 * One polled store for however many bells are mounted. A module store rather than a context because
 * the processor mounts its bell as a sibling of AppProviders, so there is no single tree to provide in.
 */

// TODO: read state is per-browser. Move it server-side when notifications get their own table.
const POLL_INTERVAL_MS = 30_000;
const SEEN_STORAGE_KEY = "stirling.notifications.lastSeenId";

function readLastSeenId(): string | null {
  try {
    return window.localStorage.getItem(SEEN_STORAGE_KEY);
  } catch {
    // Private mode: everything reads as unseen, which errs towards showing failures.
    return null;
  }
}

function writeLastSeenId(id: string): void {
  try {
    window.localStorage.setItem(SEEN_STORAGE_KEY, id);
  } catch {
    // The marker just will not survive a reload.
  }
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
  lastSeenId: string | null;
}

const NOTHING_LOADED: NotificationsSnapshot = {
  notifications: [],
  documents: {},
  lastSeenId: null,
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
  const listed = await fetchNotifications();
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

  publish({
    ...snapshot,
    notifications: listed,
    documents: Object.fromEntries(resolved),
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
  // From disk, not memory: another tab may have moved the marker on.
  snapshot = { ...NOTHING_LOADED, lastSeenId: readLastSeenId() };
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
  const newest = snapshot.notifications[0];
  if (!newest || snapshot.lastSeenId === newest.id) return;
  writeLastSeenId(newest.id);
  publish({ ...snapshot, lastSeenId: newest.id });
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
  const { notifications, documents, lastSeenId } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  );

  // A marker no longer in the list means we cannot tell how far the user got, so everything reads
  // as unread rather than being silently marked seen.
  const seenIndex = lastSeenId
    ? notifications.findIndex((n) => n.id === lastSeenId)
    : -1;
  const unreadCount = seenIndex === -1 ? notifications.length : seenIndex;

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
