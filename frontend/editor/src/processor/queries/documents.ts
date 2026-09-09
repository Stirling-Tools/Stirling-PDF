import { useQuery } from "@tanstack/react-query";
import { qk } from "@processor/queries/keys";
import { toAsyncState } from "@processor/queries/adapters";
import type { AsyncState } from "@processor/hooks/useAsync";
import {
  fetchDocuments,
  type DocumentsResponse,
} from "@processor/api/documents";
import type { Tier } from "@processor/contexts/TierContext";

/** Base query: the documents review queue (tier-scoped). */
export function useDocuments(tier: Tier): AsyncState<DocumentsResponse> {
  return toAsyncState(
    useQuery({
      queryKey: qk.documents(tier),
      queryFn: () => fetchDocuments(tier),
    }),
  );
}
