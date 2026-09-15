import { useCallback, useSyncExternalStore } from "react";

export type ProcessingCounts = Record<string, number>;

type Lister = (recordId: string) => Promise<{ state: string }[]>;

const POLL_MS = 5000;

const counts = new Map<string, ProcessingCounts>();
const subscribers = new Map<string, Set<() => void>>();
const inFlight = new Set<string>();
let timer: ReturnType<typeof setInterval> | null = null;
let lister: Lister | null = null;

async function read(recordId: string): Promise<void> {
  // One reading at a time per folder: a second view subscribing, or a tick
  // arriving while the last one is still out, joins the request in flight
  // rather than adding to it.
  if (!lister || inFlight.has(recordId)) return;
  inFlight.add(recordId);
  try {
    const files = await lister(recordId).catch(() => []);
    const next: ProcessingCounts = {};
    for (const file of files) next[file.state] = (next[file.state] ?? 0) + 1;
    counts.set(recordId, next);
    for (const notify of subscribers.get(recordId) ?? []) notify();
  } finally {
    inFlight.delete(recordId);
  }
}

/** One pass over every folder on screen, rather than one timer each. */
function tick(): void {
  for (const recordId of subscribers.keys()) void read(recordId);
}

function subscribe(recordId: string, notify: () => void): () => void {
  const forRecord = subscribers.get(recordId) ?? new Set<() => void>();
  forRecord.add(notify);
  subscribers.set(recordId, forRecord);
  // Only a folder nobody has numbers for pays for a request on subscribe. A row
  // scrolled back into view, or a second view of the same folder, takes the last
  // reading and waits for the tick, so scrolling cannot spray requests.
  if (!counts.has(recordId)) void read(recordId);
  timer ??= setInterval(tick, POLL_MS);
  return () => {
    forRecord.delete(notify);
    // The numbers outlive their last subscriber: a folder scrolled out of the
    // list and back shows what it last knew instead of blanking, and the
    // snapshot never flips to null under a component that is still mounted.
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
 * `listFiles` must keep a stable identity across renders: React resubscribes
 * whenever it changes, and every subscription opens with a request.
 */
export function useProcessingFolderCounts(
  recordId: string,
  listFiles: Lister,
): ProcessingCounts | null {
  const subscribeToRecord = useCallback(
    (notify: () => void) => {
      lister = listFiles;
      return subscribe(recordId, notify);
    },
    [recordId, listFiles],
  );
  return useSyncExternalStore(
    subscribeToRecord,
    () => counts.get(recordId) ?? null,
    () => null,
  );
}
