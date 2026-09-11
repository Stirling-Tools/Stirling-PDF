import {
  defineCustomTool,
  useToolOperation,
} from "@app/hooks/tools/shared/useToolOperation";
import { useCallback } from "react";
import { executeAutomationSequence } from "@app/utils/automationExecutor";
import { useToolRegistry } from "@app/contexts/ToolRegistryContext";
import { useFileContext } from "@app/contexts/FileContext";
import { AutomateParameters } from "@app/types/automation";
import {
  meterAutomationRun,
  type AutomationMeterInput,
} from "@app/services/automationMeter";
import { isStirlingFile } from "@app/types/fileContext";

export function useAutomateOperation() {
  const { allTools } = useToolRegistry();
  const toolRegistry = allTools;
  const { selectors } = useFileContext();

  const customProcessor = useCallback(
    async (params: AutomateParameters, files: File[]) => {
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
      );

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

  return useToolOperation<AutomateParameters>(
    defineCustomTool({
      operationType: "automate",
      customProcessor,
      consumesAllInputs: true,
    }),
  );
}
