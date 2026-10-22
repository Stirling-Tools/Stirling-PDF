import { useSyncExternalStore } from "react";

import { useQuery } from "@tanstack/react-query";

import {
  fetchToolRecommendations,
  type ToolRecommendationDto,
} from "@app/api/toolRecommendations";
import { qk } from "@app/query/keys";
import {
  getCompletionCount,
  subscribeToToolCompletions,
} from "@app/services/toolUsageTracker";
import { ToolId } from "@app/types/toolId";

const RECOMMENDATIONS_STALE_TIME = 2 * 60 * 1000;

/** Query-key stand-in for "ranked without a tool to follow". */
const NO_CONTEXT = "*";
export const DEFAULT_RECOMMENDATION_LIMIT = 8;

/**
 * Usage-ranked tools for the "what next" suggestions shown after a tool
 * finishes, or null when the backend has no data (or no recommendations API)
 * and the curated list should be shown instead.
 *
 * Scores come back with the ids: tools whose scores tie carry no preference of
 * their own, and the caller needs to know that rather than trust the order.
 *
 * `contextTool` is the tool whose panel is asking, so the ranking answers "what
 * follows this one". A completion refetches, because the run that just finished
 * is the newest evidence there is.
 */
export function useToolRecommendations(
  contextTool: ToolId | null,
  limit: number = DEFAULT_RECOMMENDATION_LIMIT,
): { recommendations: ToolRecommendationDto[] | null } {
  const completions = useSyncExternalStore(
    subscribeToToolCompletions,
    getCompletionCount,
  );

  const { data } = useQuery({
    queryKey: qk.toolRecommendations(
      contextTool ?? NO_CONTEXT,
      limit,
      completions,
    ),
    queryFn: () => fetchToolRecommendations(contextTool, limit),
    staleTime: RECOMMENDATIONS_STALE_TIME,
    retry: false,
  });

  return { recommendations: data && data.length > 0 ? data : null };
}
