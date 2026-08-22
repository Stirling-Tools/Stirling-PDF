import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@processor/queries/keys";
import { toAsyncState } from "@processor/queries/adapters";
import type { AsyncState } from "@processor/hooks/useAsync";
import {
  applyFileRunEventAction,
  fetchFileRunEvents,
  type FileRunEvent,
} from "@processor/api/fileRunEvents";
import { HttpError } from "@processor/api/http";

/** How many rows one page of the review surface asks for. */
const PAGE_SIZE = 50;

/**
 * Failures arrive from background sweeps, not from anything the reviewer did, so the list has to
 * refresh itself or it silently goes stale. Paused while the tab is hidden, since nobody is
 * reading it then.
 */
const POLL_INTERVAL_MS = 30_000;

/**
 * Answers that will not change by asking again: a build without the failure registry has no such
 * route, and a member who is not a team leader may not read the queue. Anything else — a dropped
 * connection, a restarting server, a gateway blip — is transient, and polling should ride it out
 * rather than silently switching itself off for the rest of the session.
 */
function isPermanentRefusal(error: unknown): boolean {
  return (
    error instanceof HttpError && (error.status === 403 || error.status === 404)
  );
}

/** Base query: recorded policy failures for the caller's team. */
export function useFileRunEvents(): AsyncState<FileRunEvent[]> {
  return toAsyncState(
    useQuery({
      queryKey: qk.fileRunEvents(),
      queryFn: () => fetchFileRunEvents({ limit: PAGE_SIZE }),
      // A build without the failure registry 404s and a non-leader gets a 403.
      // Neither improves on retry, and the caller renders nothing either way.
      retry: false,
      // Give up polling only on those two, never on a transient failure: treating any error as
      // permanent would let one dropped connection stop the list refreshing for the whole session.
      refetchInterval: (query) =>
        isPermanentRefusal(query.state.error) ? false : POLL_INTERVAL_MS,
      refetchIntervalInBackground: false,
    }),
  );
}

/**
 * Triage actions against the cached list. A success writes the server's own row
 * back into the cache rather than refetching, so the list does not reload and jump
 * under the reviewer; a refusal (a 409 when someone else closed it first) drops to
 * an invalidate, because the server's view is the truth.
 */
export function useFileRunEventActions() {
  const queryClient = useQueryClient();

  const apply = async (eventId: string, actionId: string) => {
    try {
      const updated = await applyFileRunEventAction(eventId, actionId);
      queryClient.setQueryData<FileRunEvent[]>(qk.fileRunEvents(), (rows) =>
        (rows ?? []).map((row) => (row.id === updated.id ? updated : row)),
      );
    } catch {
      await queryClient.invalidateQueries({ queryKey: qk.fileRunEvents() });
    }
  };

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: qk.fileRunEvents() });

  return { apply, refresh };
}
