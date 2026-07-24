import { useQuery } from "@tanstack/react-query";
import { qk } from "@portal/queries/keys";
import { toAsyncState } from "@portal/queries/adapters";
import type { AsyncState } from "@portal/hooks/useAsync";
import { fetchDocuments, type DocumentsResponse } from "@portal/api/documents";
import type { Tier } from "@portal/contexts/TierContext";

/** Base query: the documents review queue (tier-scoped). */
export function useDocuments(tier: Tier): AsyncState<DocumentsResponse> {
  return toAsyncState(
    useQuery({
      queryKey: qk.documents(tier),
      queryFn: () => fetchDocuments(tier),
    }),
  );
}
