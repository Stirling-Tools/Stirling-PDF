import {
  defineCustomTool,
  useToolOperation,
} from "@editor/hooks/tools/shared/useToolOperation";
import { useCallback, useRef } from "react";
import { executeAutomationSequence } from "@editor/utils/automationExecutor";
import { useToolRegistry } from "@editor/contexts/ToolRegistryContext";
import { useFileContext } from "@editor/contexts/FileContext";
import { AutomateParameters } from "@editor/types/automation";
import {
  meterAutomationRun,
  type AutomationMeterInput,
} from "@editor/services/automationMeter";
import { isStirlingFile } from "@editor/types/fileContext";

export function useAutomateOperation() {
  const { allTools } = useToolRegistry();
  const toolRegistry = allTools;
  const { selectors } = useFileContext();

  // useToolOperation does not hand its cancellation to a custom processor, so the
  // run keeps its own; cancelOperation below aborts both.
  const runAbort = useRef<AbortController | null>(null);

  const customProcessor = useCallback(
    async (params: AutomateParameters, files: File[]) => {
      const run = new AbortController();
      runAbort.current = run;
      const signal = run.signal;
      console.log("🚀 Starting automation execution via customProcessor", {
        params,
        files,
      });

      if (!params.automationConfig) {
        throw new Error("No automation configuration provided");
      }
      const automationConfig = params.automationConfig;

      // Execute the automation sequence and return the final results
      const finalResults = await executeAutomationSequence(
        automationConfig,
        files,
        toolRegistry,
        (stepIndex: number, operationName: string) => {
          console.log(`Step ${stepIndex + 1} started: ${operationName}`);
          params.onStepStart?.(stepIndex, operationName);
        },
        (stepIndex: number, resultFiles: File[]) => {
          console.log(
            `Step ${stepIndex + 1} completed with ${resultFiles.length} files`,
          );
          params.onStepComplete?.(stepIndex, resultFiles);
        },
        (stepIndex: number, error: string) => {
          console.error(`Step ${stepIndex + 1} failed:`, error);
          params.onStepError?.(stepIndex, error);
          throw new Error(`Automation step ${stepIndex + 1} failed: ${error}`);
        },
        signal,
      );
      // Cancelled as the last step finished: its results must not land.
      signal.throwIfAborted();

      console.log(
        `✅ Automation completed, returning ${finalResults.length} files`,
      );

      // Meter the completed run. Charged on the input set's doc-units (once
      // per run) so an Automate workflow costs the same as the equivalent policy.
      // Best-effort and post-success - never blocks the returned result.
      try {
        const inputs: AutomationMeterInput[] = files.map((file) => ({
          pages: isStirlingFile(file)
            ? (selectors.getStirlingFileStub(file.fileId)?.processedFile
                ?.totalPages ?? 0)
            : 0,
          bytes: file.size ?? 0,
        }));
        meterAutomationRun({
          source: "AUTOMATE",
          automationName: automationConfig.name,
          operations: automationConfig.operations.map(
            (operation) => operation.operation,
          ),
          inputs,
        });
      } catch (meterError) {
        console.warn("Automation metering skipped:", meterError);
      }

      return {
        files: finalResults,
        consumedAllInputs: true,
      };
    },
    [toolRegistry, selectors],
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
