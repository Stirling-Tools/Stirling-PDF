import { useCallback } from "react";
import {
  defineCustomTool,
  useToolOperation,
} from "@app/hooks/tools/shared/useToolOperation";
import { executeAutomationSequence } from "@app/utils/automationExecutor";
import { useToolRegistry } from "@app/contexts/ToolRegistryContext";
import type { AutomateParameters } from "@app/types/automation";

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
