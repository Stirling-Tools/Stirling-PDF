import { useEffect, useMemo, useState } from "react";
import { fileStorage } from "@editor/services/fileStorage";
import { ToolRegistry } from "@editor/data/toolsTaxonomy";
import {
  ActivityChain,
  findRepeatedChains,
} from "@editor/utils/activityChains";
import {
  excludeExisting,
  useIsAutomatableTool,
  useToolWorkflowSuggestions,
} from "@editor/hooks/useToolWorkflowSuggestions";

export function useActivityAutomations(
  toolRegistry: Partial<ToolRegistry>,
  existingOperationLists: string[][],
): ActivityChain[] {
  const [histories, setHistories] = useState<string[][]>([]);
  const isAutomatable = useIsAutomatableTool(toolRegistry);
  const serverChains = useToolWorkflowSuggestions(
    toolRegistry,
    existingOperationLists,
  );

  useEffect(() => {
    let cancelled = false;
    fileStorage
      .getLeafStirlingFileStubs()
      .then((stubs) => {
        if (cancelled) return;
        setHistories(
          stubs
            .map((stub) => (stub.toolHistory ?? []).map((op) => op.toolId))
            .filter((history) => history.length > 1),
        );
      })
      .catch((error) => {
        console.warn("[useActivityAutomations] Failed to read history", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const localChains = useMemo(
    () =>
      excludeExisting(
        findRepeatedChains(histories, { isAutomatable, limit: Infinity }),
        existingOperationLists,
      ),
    [histories, isAutomatable, existingOperationLists],
  );

  return serverChains && serverChains.length > 0 ? serverChains : localChains;
}
