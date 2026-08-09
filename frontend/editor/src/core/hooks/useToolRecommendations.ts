import { useCallback, useMemo, useSyncExternalStore } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ANY_CONTEXT,
  dismissToolRecommendation,
  fetchToolRecommendations,
  undoDismissToolRecommendation,
} from "@app/api/toolRecommendations";
import { qk } from "@app/query/keys";
import {
  getLastCompletedTool,
  subscribeToToolCompletions,
} from "@app/services/toolUsageTracker";
import { isValidToolId, ToolId } from "@app/types/toolId";

const RECOMMENDATIONS_STALE_TIME = 2 * 60 * 1000;
export const DEFAULT_RECOMMENDATION_LIMIT = 8;

/** The tool the user most recently completed; recommendations answer "what next after it". */
export function useRecommendationContextTool(): ToolId | null {
  return useSyncExternalStore(subscribeToToolCompletions, getLastCompletedTool);
}

/**
 * Usage-ranked tool ids for the recommended section, or null when the backend
 * has no data (or no recommendations API) and the static list should be shown.
 */
export function useToolRecommendations(
  limit: number = DEFAULT_RECOMMENDATION_LIMIT,
): {
  recommendedToolIds: ToolId[] | null;
  contextTool: ToolId | null;
} {
  const contextTool = useRecommendationContextTool();

  const { data } = useQuery({
    queryKey: qk.toolRecommendations(contextTool ?? ANY_CONTEXT, limit),
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

/**
 * Dismisses a recommendation for the given context (or everywhere when the
 * context is null), with an optimistic cache update; returns an undo callback.
 */
export function useDismissToolRecommendation(): (
  contextTool: ToolId | null,
  dismissedTool: ToolId,
) => Promise<() => Promise<void>> {
  const queryClient = useQueryClient();

  return useCallback(
    async (contextTool: ToolId | null, dismissedTool: ToolId) => {
      // Dismissals are context-scoped, so only that context's cached lists are
      // touched; the key prefix stops short of the limit to cover every variant.
      const contextKey = [
        "editor",
        "toolRecommendations",
        contextTool ?? ANY_CONTEXT,
      ];
      const invalidate = () =>
        void queryClient.invalidateQueries({ queryKey: contextKey });

      queryClient.setQueriesData<{ toolKey: string; score: number }[] | null>(
        { queryKey: contextKey },
        (existing) =>
          existing
            ? existing.filter((r) => r.toolKey !== dismissedTool)
            : existing,
      );
      try {
        await dismissToolRecommendation(contextTool, dismissedTool);
      } finally {
        invalidate();
      }
      return async () => {
        await undoDismissToolRecommendation(contextTool, dismissedTool);
        invalidate();
      };
    },
    [queryClient],
  );
}
