import { useMemo } from "react";
import { useNavigationState } from "@app/contexts/NavigationContext";
import { useToolNavigation } from "@app/hooks/useToolNavigation";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useToolRecommendations } from "@app/hooks/useToolRecommendations";
import { isComingSoonTool } from "@app/data/toolsTaxonomy";
import { ToolId } from "@app/types/toolId";

export interface SuggestedTool {
  id: ToolId;
  title: string;
  icon: React.ReactNode;
  href: string;
  onClick: (e: React.MouseEvent) => void;
}

/** Shown when usage tracking is off or has nothing to say yet. */
const FALLBACK_TOOL_IDS: ToolId[] = [
  "compress",
  "convert",
  "sanitize",
  "split",
  "ocr",
];

const SUGGESTION_COUNT = 4;

// A couple spare, so tools that cannot open still leave a full list.
const FETCH_LIMIT = SUGGESTION_COUNT + 2;

/**
 * What to do next with the file that just came out of a tool.
 *
 * Ranked by how this user, their team and the install actually use tools after
 * the current one, and topped up from the curated list so the section never
 * shrinks. Falls back to the curated list entirely when the backend has no
 * usage data - a fresh install, or analytics turned off.
 */
export function useSuggestedTools(): SuggestedTool[] {
  const { selectedTool } = useNavigationState();
  const { getToolNavigation } = useToolNavigation();
  const { getSelectedTool } = useToolWorkflow();
  const { recommendedToolIds } = useToolRecommendations(FETCH_LIMIT);

  return useMemo(() => {
    const ordered = [...(recommendedToolIds ?? []), ...FALLBACK_TOOL_IDS];
    const suggestions: SuggestedTool[] = [];
    const seen = new Set<ToolId>();

    for (const id of ordered) {
      if (id === selectedTool || seen.has(id)) continue;
      const tool = getSelectedTool(id);
      // A card that cannot open anything is worse than a shorter list.
      if (!tool || isComingSoonTool(id, tool)) continue;

      seen.add(id);
      suggestions.push({
        id,
        title: tool.name,
        icon: tool.icon,
        ...getToolNavigation(id, tool),
      });
      if (suggestions.length === SUGGESTION_COUNT) break;
    }

    return suggestions;
  }, [recommendedToolIds, selectedTool, getToolNavigation, getSelectedTool]);
}
