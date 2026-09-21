import { useEffect, useRef } from "react";
import { refreshNotificationsNow } from "@app/hooks/useNotifications";
import type { DiskFileState } from "@app/components/filesPage/FileGrid";

/**
 * How long a burst of failures is gathered before reading. A sweep fails its files in parallel, so
 * without this a folder of four hundred bad documents would be four hundred reads of the same list.
 */
const SETTLE_MS = 1000;

/**
 * Re-read the notifications when a document in the open folder has *become* failed, throttled to one
 * read per {@link SETTLE_MS}. Already-failed rows are not news, and a burst of 400 is one read.
 */
export function useNewFailureNotifications(
  folderId: string | undefined,
  states: ReadonlyMap<string, DiskFileState>,
): void {
  // Null until this folder has been read once: the first read is the baseline, not a change.
  const seen = useRef<{
    folder: string | undefined;
    states: ReadonlyMap<string, DiskFileState>;
  } | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const previous = seen.current;
    seen.current = { folder: folderId, states };
    if (!previous || previous.folder !== folderId) return;
    if (!hasNewFailure(previous.states, states)) return;
    // Already gathering: this failure joins that read instead of asking for its own.
    if (pending.current !== null) return;
    pending.current = setTimeout(() => {
      pending.current = null;
      refreshNotificationsNow();
    }, SETTLE_MS);
  }, [folderId, states]);

  useEffect(
    () => () => {
      if (pending.current !== null) clearTimeout(pending.current);
    },
    [],
  );
}

/** Whether any document failed that was not already failing when the folder was last read. */
function hasNewFailure(
  previous: ReadonlyMap<string, DiskFileState>,
  current: ReadonlyMap<string, DiskFileState>,
): boolean {
  for (const [name, state] of current) {
    if (state === "failed" && previous.get(name) !== "failed") {
      return true;
    }
  }
  return false;
}
