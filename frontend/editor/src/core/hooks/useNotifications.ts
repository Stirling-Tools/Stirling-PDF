import { useSyncExternalStore } from "react";
import {
  fetchNotifications,
  type AppNotification,
} from "@app/services/notifications";
import {
  hasLocalFile,
  loadRetryPayload,
  type RetryPayload,
} from "@app/services/notificationRetry";

/**
 * The caller's notifications, refreshed on a timer because they arrive from background work rather
 * than from anything the user just did.
 *
 * One set of data for however many bells are on screen. The bell is mounted more than once, so the
 * list, the document lookups and the read marker live in the module-level store below and each mount
 * merely subscribes; otherwise two badges can disagree while reading the same localStorage key.
 *
 * A module-level store rather than a React context because there is no single tree to hang a provider
 * in: the portal mounts its bell as a sibling of AppProviders. Each bell still owns its own open state.
 *
 * TODO: read state is tracked here, in the browser, as the time of the newest notification the user
 * has seen. That is enough for one device and one person, but it does not survive a cache clear
 * and does not follow them to another browser. When notifications become a server-side concept
 * with their own table, move this there: the server can then record which user has read which
 * notification, durably and per user, and this hook just renders what it is told.
 */

const POLL_INTERVAL_MS = 30_000;
const SEEN_STORAGE_KEY = "stirling.notifications.readThroughAt";

/** What the read marker measures against. A time, not an id: ids point at nothing once a row leaves. */
function orderedAt(notification: AppNotification): number {
  // Ordered server-side by when the failure last occurred, so a repeat is news again.
  return Date.parse(notification.lastSeenAt);
}

function readReadThrough(): number | null {
  try {
    const stored = Number(window.localStorage.getItem(SEEN_STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : null;
  } catch {
    // Private mode, or storage disabled. Everything then reads as unseen, which errs towards
    // showing the user their failures rather than hiding them.
    return null;
  }
}

function writeReadThrough(at: number): void {
  try {
    window.localStorage.setItem(SEEN_STORAGE_KEY, String(at));
  } catch {
    // Nothing to do: the marker simply will not persist across a reload.
  }
}

/**
 * What this browser holds for the document a notification is about, which decides what can actually run
 * here. Resolved for the list rather than per row, since the answers come from IndexedDB.
 */
export interface NotificationDocumentState {
  hasLocalFile: boolean;
  retryPayload: RetryPayload | null;
}

const NO_DOCUMENT: NotificationDocumentState = {
  hasLocalFile: false,
  retryPayload: null,
};

/**
 * Whether this browser could resolve the document a notification names, which is the one place that
 * rule is stated.
 *
 * Two id spaces share the one fileId field. An attended run reports the id its editor minted, so a
 * lookup here can succeed; an unattended run reports its source's one-way hash of a path or key, which
 * was never on any device. The discriminator is the absence of a source rather than the origin, since
 * an attended policy run now sends a client reference too.
 */
export function isResolvableHere(notification: AppNotification): boolean {
  // Coalesced, so a row from a server that does not send the field reads as "no source".
  return (notification.sourceId ?? null) === null;
}

/** Everything the bells read. Replaced wholesale, never mutated, so it can be a snapshot. */
interface NotificationsSnapshot {
  notifications: AppNotification[];
  /** Keyed by fileId, so several rows about the same document cost one pair of lookups. */
  documents: Record<string, NotificationDocumentState>;
  /** Everything up to and including this time has been read. Epoch millis, never a row id. */
  readThroughAt: number | null;
}

const NOTHING_LOADED: NotificationsSnapshot = {
  notifications: [],
  documents: {},
  readThroughAt: null,
};

let snapshot: NotificationsSnapshot = NOTHING_LOADED;
const subscribers = new Set<() => void>();
let pollTimer: number | null = null;
/** The read in progress, if any, so that everyone who asks while it runs joins it. */
let inFlight: Promise<void> | null = null;
/** Bumped whenever polling starts or stops, so a read from a finished cycle cannot write. */
let cycle = 0;
let notifyQueued = false;

function getSnapshot(): NotificationsSnapshot {
  return snapshot;
}

/**
 * New snapshot now, subscribers told on a microtask. Deferred because a bell marks the list read from
 * inside its own state updater, i.e. while rendering, and re-rendering every other bell from there is
 * the render-phase update React refuses. A microtask is still the same tick, so no bell paints a badge
 * it should have dropped. Coalesced, so a burst of writes costs one round of re-renders.
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
  const { notifications: listed, viewerReviewsTeam } =
    await fetchNotifications();
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
            retryPayload: await loadRetryPayload(fileId),
          },
        ] as const,
    ),
  );
  if (forCycle !== cycle) return;

  const documents = Object.fromEntries(resolved);
  // A member sees only their own failures, and one whose document is not in this browser is noise:
  // they cannot open it, and are not the reviewer who could fix the policy. A reviewer keeps all.
  const visible = viewerReviewsTeam
    ? listed
    : listed.filter((n) =>
        Boolean(n.fileId && documents[n.fileId]?.hasLocalFile),
      );

  publish({ ...snapshot, notifications: visible, documents });
}

/**
 * Read the list once, however many callers want it: a caller arriving mid-read joins the read already
 * running. An action's refresh can then be answered by a read that started just before it landed, which
 * the next poll corrects.
 */
function load(): Promise<void> {
  if (inFlight) return inFlight;
  const pending = read(cycle).finally(() => {
    if (inFlight === pending) inFlight = null;
  });
  inFlight = pending;
  return pending;
}

function startPolling(): void {
  cycle += 1;
  // Re-read from disk rather than trusting what the last bell left in memory: another tab may have
  // moved the marker on since.
  snapshot = { ...NOTHING_LOADED, readThroughAt: readReadThrough() };
  pollTimer = window.setInterval(() => void load(), POLL_INTERVAL_MS);
  void load();
}

function stopPolling(): void {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
  // Anything still in flight belongs to a cycle nobody is watching: drop its result, and do not let
  // the next bell join it.
  cycle += 1;
  inFlight = null;
  snapshot = NOTHING_LOADED;
}

/** Polling lives exactly as long as there is a bell to show it: one timer, no leak. */
function subscribe(onStoreChange: () => void): () => void {
  subscribers.add(onStoreChange);
  if (subscribers.size === 1) startPolling();
  return () => {
    subscribers.delete(onStoreChange);
    if (subscribers.size === 0) stopPolling();
  };
}

/** Everything currently listed becomes read, for every bell at once. */
function markAllSeen(): void {
  // The newest time in the list, not the first row's, so a re-sorted list cannot under-mark.
  const newest = Math.max(
    ...snapshot.notifications.map(orderedAt).filter(Number.isFinite),
  );
  if (!Number.isFinite(newest)) return;
  if (snapshot.readThroughAt !== null && newest <= snapshot.readThroughAt)
    return;
  writeReadThrough(newest);
  publish({ ...snapshot, readThroughAt: newest });
}

function refresh(): void {
  void load();
}

/**
 * Re-read now, for a caller that has just caused a notification to exist. Without it the person who
 * triggered a failure waits up to a whole poll interval to be told about their own action, which
 * reads as the app not having noticed. Everyone else's failures still arrive on the poll, which is
 * what it is for.
 *
 * A no-op when no bell is mounted: there is nobody to tell, and the next mount reads for itself.
 * Safe to call after a report that was refused, since the re-read simply finds nothing new.
 */
export function refreshNotificationsNow(): void {
  if (subscribers.size === 0) return;
  void load();
}

export interface NotificationsState {
  notifications: AppNotification[];
  /**
   * How many are newer than the last one the user looked at: the badge, and the boundary the panel
   * divides new from earlier on. Read before {@link markAllSeen}, which zeroes it.
   */
  unreadCount: number;
  /** What this device holds for a row's document. Answers for a document it knows nothing about. */
  documentStateFor: (
    notification: AppNotification,
  ) => NotificationDocumentState;
  /** Call when the user opens the panel: everything currently listed becomes read. */
  markAllSeen: () => void;
  refresh: () => void;
}

export function useNotifications(): NotificationsState {
  const { notifications, documents, readThroughAt } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  );

  // Newer than the watermark is new, so a resolved row leaves without dragging the rest back into
  // unread. A time that will not parse counts as new, which errs towards telling the user.
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
