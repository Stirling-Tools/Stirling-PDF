import { useCallback } from "react";
import {
  defineCustomTool,
  useToolOperation,
} from "@editor/hooks/tools/shared/useToolOperation";
import { executeAutomationSequence } from "@editor/utils/automationExecutor";
import { useToolRegistry } from "@editor/contexts/ToolRegistryContext";
import type { AutomateParameters } from "@editor/types/automation";

/** Server execution includes metering; a second browser meter would charge the same run twice. */
export function useAutomateOperation() {
  const { allTools } = useToolRegistry();
  const customProcessor = useCallback(
    async (params: AutomateParameters, files: File[]) => {
      if (!params.automationConfig)
        throw new Error("No automation configuration provided");
      const results = await executeAutomationSequence(
        params.automationConfig,
        files,
        allTools,
        params.onStepStart,
        params.onStepComplete,
        params.onStepError,
      );
      return { files: results, consumedAllInputs: true };
    },
    [allTools],
  );
  return useToolOperation<AutomateParameters>(
    defineCustomTool({
      operationType: "automate",
      customProcessor,
      consumesAllInputs: true,
    }),
  );
}
