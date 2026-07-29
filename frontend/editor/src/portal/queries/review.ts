import { useQuery } from "@tanstack/react-query";
import { qk } from "@portal/queries/keys";
import { toAsyncState } from "@portal/queries/adapters";
import type { AsyncState } from "@portal/hooks/useAsync";
import {
  fetchReviewConfig,
  fetchReviewItems,
  type ReviewConfig,
  type ReviewItemStatus,
  type ReviewItemsResponse,
} from "@portal/api/review";

/** The team-wide review-bucket configuration (GET /api/v1/review/config). */
export function useReviewConfig(): AsyncState<ReviewConfig> {
  return toAsyncState(
    useQuery({ queryKey: qk.reviewConfig(), queryFn: fetchReviewConfig }),
  );
}

/** Held items, optionally by status (GET /api/v1/review/items). */
export function useReviewItems(
  status?: ReviewItemStatus,
): AsyncState<ReviewItemsResponse> {
  return toAsyncState(
    useQuery({
      queryKey: qk.reviewItems(status),
      queryFn: () => fetchReviewItems(status),
    }),
  );
}
