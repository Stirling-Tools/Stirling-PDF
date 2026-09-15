import { useCallback, useSyncExternalStore } from "react";

export type ProcessingCounts = Record<string, number>;

type Lister = (recordId: string) => Promise<{ state: string }[]>;

const POLL_MS = 5000;

const counts = new Map<string, ProcessingCounts>();
const subscribers = new Map<string, Set<() => void>>();
let timer: ReturnType<typeof setInterval> | null = null;
let lister: Lister | null = null;

async function read(recordId: string): Promise<void> {
  if (!lister) return;
  const files = await lister(recordId).catch(() => []);
  const next: ProcessingCounts = {};
  for (const file of files) next[file.state] = (next[file.state] ?? 0) + 1;
  counts.set(recordId, next);
  for (const notify of subscribers.get(recordId) ?? []) notify();
}

/** One pass over every folder on screen, rather than one timer each. */
function tick(): void {
  for (const recordId of subscribers.keys()) void read(recordId);
}

function subscribe(recordId: string, notify: () => void): () => void {
  const forRecord = subscribers.get(recordId) ?? new Set<() => void>();
  forRecord.add(notify);
  subscribers.set(recordId, forRecord);
  void read(recordId);
  timer ??= setInterval(tick, POLL_MS);
  return () => {
    forRecord.delete(notify);
    // The numbers outlive the last subscriber, so a row the list windows out and
    // back paints what it had while the next read is in flight.
    if (forRecord.size === 0) subscribers.delete(recordId);
    if (subscribers.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/**
 * Live per-state counts for a processing folder. The numbers are shared, so a folder
 * shown as a card and as a row - or the same row remounted by the list's windowing -
 * costs one request per interval rather than one per component.
 *
 * One lister serves every subscriber, so callers must pass equivalent ones: the most
 * recent call's lister is the one the polling uses, for all records.
 */
export function useProcessingFolderCounts(
  recordId: string,
  listFiles: Lister,
): ProcessingCounts | null {
  lister = listFiles;
  // Both are held across renders: useSyncExternalStore resubscribes whenever the
  // subscribe function's identity changes, and resubscribing reads, which
  // notifies, which renders - a loop that never reaches the poll interval.
  const subscribeToRecord = useCallback(
    (notify: () => void) => subscribe(recordId, notify),
    [recordId],
  );
  const readCounts = useCallback(
    () => counts.get(recordId) ?? null,
    [recordId],
  );
  return useSyncExternalStore(subscribeToRecord, readCounts, () => null);
}
