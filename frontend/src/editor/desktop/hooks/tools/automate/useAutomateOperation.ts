import { useCallback, useRef } from "react";
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
  // useToolOperation does not hand its cancellation to a custom processor, so the
  // run keeps its own; cancelOperation below aborts both.
  const runAbort = useRef<AbortController | null>(null);

  const customProcessor = useCallback(
    async (params: AutomateParameters, files: File[]) => {
      const run = new AbortController();
      runAbort.current = run;
      const signal = run.signal;
      if (!params.automationConfig)
        throw new Error("No automation configuration provided");
      const results = await executeAutomationSequence(
        params.automationConfig,
        files,
        allTools,
        params.onStepStart,
        params.onStepComplete,
        params.onStepError,
        signal,
      );
      // Cancelled as the last step finished: its results must not land.
      signal.throwIfAborted();
      return { files: results, consumedAllInputs: true };
    },
    [allTools],
  );
  const operation = useToolOperation<AutomateParameters>(
    defineCustomTool({
      operationType: "automate",
      customProcessor,
      consumesAllInputs: true,
    }),
  );
  const { cancelOperation: cancelToolOperation } = operation;
  const cancelOperation = useCallback(() => {
    runAbort.current?.abort();
    cancelToolOperation();
  }, [cancelToolOperation]);

  return { ...operation, cancelOperation };
}
