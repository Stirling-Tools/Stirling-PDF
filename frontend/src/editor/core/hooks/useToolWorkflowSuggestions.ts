import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  fetchToolWorkflows,
  type ToolWorkflowScope,
} from "@editor/api/toolRecommendations";
import { qk } from "@editor/query/keys";
import {
  getToolSupportsAutomate,
  ToolRegistry,
} from "@editor/data/toolsTaxonomy";
import { ToolId } from "@editor/types/toolId";
import {
  ActivityChain,
  ActivityScope,
  ChainOrder,
  rankChains,
  sameOperations,
} from "@editor/utils/activityChains";

const WORKFLOW_STALE_TIME = 2 * 60 * 1000;
const WORKFLOW_FETCH_LIMIT = 20;
export const MAX_WORKFLOW_SUGGESTIONS = 3;
const MAX_NAMED_STEPS = 3;

const SCOPES: Record<ToolWorkflowScope, ActivityScope> = {
  USER: "user",
  TEAM: "team",
  GLOBAL: "install",
};

export function useIsAutomatableTool(
  toolRegistry: Partial<ToolRegistry>,
): (toolId: string) => boolean {
  return useCallback(
    (toolId: string) => {
      if (toolId === "automate") return false;
      const tool = toolRegistry[toolId as ToolId];
      return Boolean(
        tool && tool.operationConfig && getToolSupportsAutomate(tool),
      );
    },
    [toolRegistry],
  );
}

export function excludeExisting(
  chains: ActivityChain[],
  existingOperationLists: string[][],
  limit = MAX_WORKFLOW_SUGGESTIONS,
): ActivityChain[] {
  return chains
    .filter(
      (chain) =>
        !existingOperationLists.some((operations) =>
          sameOperations(operations, chain.operations),
        ),
    )
    .slice(0, limit);
}

export function useToolWorkflowSuggestions(
  toolRegistry: Partial<ToolRegistry>,
  existingOperationLists: string[][],
  limit = MAX_WORKFLOW_SUGGESTIONS,
  order: ChainOrder = "nearestFirst",
): ActivityChain[] | null {
  const isAutomatable = useIsAutomatableTool(toolRegistry);
  const { data } = useQuery({
    queryKey: qk.toolWorkflows(WORKFLOW_FETCH_LIMIT),
    queryFn: () => fetchToolWorkflows(WORKFLOW_FETCH_LIMIT),
    staleTime: WORKFLOW_STALE_TIME,
    retry: false,
  });

  return useMemo(() => {
    if (!data) return null;
    const chains = data
      .filter((workflow) => workflow.tools.every(isAutomatable))
      .map((workflow) => ({
        operations: workflow.tools,
        fileCount: workflow.count,
        scope: SCOPES[workflow.scope],
      }));
    return excludeExisting(
      rankChains(chains, { limit: Infinity, order }),
      existingOperationLists,
      limit,
    );
  }, [data, isAutomatable, existingOperationLists, limit, order]);
}

export function useActivityChainText(toolRegistry: Partial<ToolRegistry>) {
  const { t } = useTranslation();

  const name = useCallback(
    (chain: ActivityChain) => {
      const names = chain.operations.map(
        (operation) =>
          toolRegistry[operation as ToolId]?.name ??
          t(`tools.${operation}.name`, operation),
      );
      if (names.length <= MAX_NAMED_STEPS) return names.join(" → ");
      return t(
        "toolWorkflows.longName",
        "{{first}} → … → {{last}} ({{count}} steps)",
        { first: names[0], last: names[names.length - 1], count: names.length },
      );
    },
    [toolRegistry, t],
  );

  const ranBy = useCallback(
    (chain: ActivityChain) => {
      const count = chain.fileCount;
      switch (chain.scope) {
        case "team":
          return t(
            "toolWorkflows.ranBy.team",
            "Your team has done this {{count, number}} times.",
            { count },
          );
        case "install":
          return t(
            "toolWorkflows.ranBy.install",
            "Your colleagues have done this {{count, number}} times.",
            { count },
          );
        default:
          return t(
            "toolWorkflows.ranBy.user",
            "You've done this {{count, number}} times.",
            { count },
          );
      }
    },
    [t],
  );

  return { name, ranBy };
}
