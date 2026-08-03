import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@portal/queries/keys";
import { toAsyncState } from "@portal/queries/adapters";
import type { AsyncState } from "@portal/hooks/useAsync";
import {
  applyFileRunEventAction,
  fetchFileRunEvents,
  type FileRunEvent,
} from "@portal/api/fileRunEvents";

/** How many rows one page of the review surface asks for. */
const PAGE_SIZE = 50;

/** Base query: recorded policy failures for the caller's team. */
export function useFileRunEvents(): AsyncState<FileRunEvent[]> {
  return toAsyncState(
    useQuery({
      queryKey: qk.fileRunEvents(),
      queryFn: () => fetchFileRunEvents({ limit: PAGE_SIZE }),
      // A build without the failure registry 404s and a non-leader gets a 403.
      // Neither improves on retry, and the caller renders nothing either way.
      retry: false,
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
