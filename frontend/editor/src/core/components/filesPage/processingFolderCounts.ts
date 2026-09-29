import { useQuery } from "@tanstack/react-query";
import { qk } from "@app/query/keys";

export type ProcessingCounts = Record<string, number>;

type Lister = (recordId: string) => Promise<{ state: string }[]>;

const POLL_MS = 5000;

/**
 * Live per-state counts for a processing folder. The numbers are shared, so a folder
 * shown as a card and as a row - or the same row remounted by the list's windowing -
 * costs one request per interval rather than one per component.
 *
 * The poll stands down while the tab is hidden and resumes on the next tick: a files
 * page left open in a background tab asked every 5s indefinitely before.
 */
export function useProcessingFolderCounts(
  recordId: string,
  listFiles: Lister,
): ProcessingCounts | null {
  const { data } = useQuery({
    queryKey: qk.processingFolderCounts(recordId),
    queryFn: async () => {
      // A failed read reports no states rather than an error: the badge is ambient,
      // and the next tick retries anyway.
      const files = await listFiles(recordId).catch(() => []);
      const counts: ProcessingCounts = {};
      for (const file of files)
        counts[file.state] = (counts[file.state] ?? 0) + 1;
      return counts;
    },
    refetchInterval: POLL_MS,
  });
  return data ?? null;
}
