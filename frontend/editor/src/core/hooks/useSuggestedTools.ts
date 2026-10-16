import { useMemo } from "react";
import { useNavigationState } from "@app/contexts/NavigationContext";
import { useToolNavigation } from "@app/hooks/useToolNavigation";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useToolRecommendations } from "@app/hooks/useToolRecommendations";
import { isComingSoonTool } from "@app/data/toolsTaxonomy";
import { isValidToolId, ToolId } from "@app/types/toolId";

export interface SuggestedTool {
  id: ToolId;
  title: string;
  icon: React.ReactNode;
  href: string;
  onClick: (e: React.MouseEvent) => void;
}

/**
 * Shown when usage tracking has nothing to say, and the order tied scores fall
 * back to - see {@link orderRanked}.
 */
const FALLBACK_TOOL_IDS: ToolId[] = [
  "compress",
  "convert",
  "sanitize",
  "split",
  "ocr",
];

const SUGGESTION_COUNT = 4;

// Well past what is shown: tools on equal scores are reordered here, so they
// have to survive the server's own limit to be reordered at all.
const FETCH_LIMIT = 12;

function curatedRank(id: ToolId): number {
  const index = FALLBACK_TOOL_IDS.indexOf(id);
  return index === -1 ? FALLBACK_TOOL_IDS.length : index;
}

/**
 * Equal scores mean the usage data expressed no preference between those tools.
 * Sorting them by name would still produce a confident-looking list, just an
 * alphabetical one, so ties fall back to the curated order instead.
 */
function orderRanked(ranked: { toolKey: string; score: number }[]): ToolId[] {
  return ranked
    .filter((entry): entry is { toolKey: ToolId; score: number } =>
      isValidToolId(entry.toolKey),
    )
    .sort(
      (a, b) =>
        b.score - a.score ||
        curatedRank(a.toolKey) - curatedRank(b.toolKey) ||
        a.toolKey.localeCompare(b.toolKey),
    )
    .map((entry) => entry.toolKey);
}

/**
 * What to do next with the file that just came out of a tool.
 *
 * Ranked by how this user, their team and the install actually use tools after
 * the current one, and topped up from the curated list so the section never
 * shrinks. Falls back to the curated list entirely when the backend has no
 * usage data - a fresh install, tracking off, or no login to attribute runs to.
 */
export function useSuggestedTools(): SuggestedTool[] {
  const { selectedTool } = useNavigationState();
  const { getToolNavigation } = useToolNavigation();
  const { getSelectedTool, toolAvailability } = useToolWorkflow();
  const { recommendations } = useToolRecommendations(selectedTool, FETCH_LIMIT);

  return useMemo(() => {
    const ordered = [
      ...orderRanked(recommendations ?? []),
      ...FALLBACK_TOOL_IDS,
    ];
    const suggestions: SuggestedTool[] = [];
    const seen = new Set<ToolId>();

    for (const id of ordered) {
      if (id === selectedTool || seen.has(id)) continue;
      const tool = getSelectedTool(id);
      // A card that cannot open anything is worse than a shorter list, and a
      // tool this install has disabled or cannot run is one of those.
      if (!tool || isComingSoonTool(id, tool)) continue;
      if (toolAvailability[id]?.available === false) continue;

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
  }, [
    recommendations,
    selectedTool,
    getToolNavigation,
    getSelectedTool,
    toolAvailability,
  ]);
}
