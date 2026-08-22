import { useMemo, useSyncExternalStore } from "react";

import { useQuery } from "@tanstack/react-query";

import { fetchToolRecommendations } from "@app/api/toolRecommendations";
import { qk } from "@app/query/keys";
import {
  getLastCompletedTool,
  subscribeToToolCompletions,
} from "@app/services/toolUsageTracker";
import { isValidToolId, ToolId } from "@app/types/toolId";

const RECOMMENDATIONS_STALE_TIME = 2 * 60 * 1000;

/** Query-key stand-in for "no tool has finished yet". */
const NO_CONTEXT = "*";
export const DEFAULT_RECOMMENDATION_LIMIT = 8;

/** The tool the user most recently completed; recommendations answer "what next after it". */
export function useRecommendationContextTool(): ToolId | null {
  return useSyncExternalStore(subscribeToToolCompletions, getLastCompletedTool);
}

/**
 * Usage-ranked tool ids for the "what next" suggestions shown after a tool
 * finishes, or null when the backend has no data (or no recommendations API)
 * and the curated list should be shown instead.
 */
export function useToolRecommendations(
  limit: number = DEFAULT_RECOMMENDATION_LIMIT,
): {
  recommendedToolIds: ToolId[] | null;
  contextTool: ToolId | null;
} {
  const contextTool = useRecommendationContextTool();

  const { data } = useQuery({
    queryKey: qk.toolRecommendations(contextTool ?? NO_CONTEXT, limit),
    queryFn: () => fetchToolRecommendations(contextTool, limit),
    staleTime: RECOMMENDATIONS_STALE_TIME,
    retry: false,
  });

  const recommendedToolIds = useMemo(() => {
    if (!data) return null;
    const ids = data.map((r) => r.toolKey).filter(isValidToolId);
    return ids.length > 0 ? (ids as ToolId[]) : null;
  }, [data]);

  return { recommendedToolIds, contextTool };
}
