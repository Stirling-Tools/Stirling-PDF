import type { executeAutomationSequence as CoreExecuteAutomationSequence } from "@core/utils/automationExecutor";
export {
  executeToolOperation,
  executeToolOperationWithPrefix,
  processMultiFileResponse,
} from "@core/utils/automationExecutor";
import { getServerAutomationSession } from "@app/services/serverAutomationSession";
import {
  submitServerPipeline,
  waitForServerPipeline,
  downloadServerPipelineOutput,
} from "@app/services/serverPipeline";
import type { BackendPipelineStep } from "@app/services/policyPipeline";
import type { ToolId } from "@app/types/toolId";
import { ToolType } from "@app/hooks/tools/shared/useToolOperation";
import { objectToFormData } from "@app/hooks/tools/shared/toolApiMapping";

/** Desktop automation executes as one server pipeline, including locally available tools. */
export const executeAutomationSequence: typeof CoreExecuteAutomationSequence =
  async (
    automation,
    files,
    registry,
    onStepStart,
    onStepComplete,
    onStepError,
  ) => {
    const session = await getServerAutomationSession();
    if (!automation.operations.length || !files.length)
      throw new Error("No pipeline inputs or steps");
    const assets: { key: string; file: Blob }[] = [];
    const steps: BackendPipelineStep[] = automation.operations.map(
      (operation, index) => {
        const config = registry[operation.operation as ToolId]?.operationConfig;
        if (!config) {
          throw new Error(
            `No server pipeline configuration for ${operation.operation}`,
          );
        }
        const params = { ...config.defaultParameters, ...operation.parameters };
        const endpoint =
          typeof config.endpoint === "function"
            ? config.endpoint(params)
            : config.endpoint;
        if (!endpoint)
          throw new Error(`No server endpoint for ${operation.operation}`);
        const form =
          config.toolType === ToolType.custom
            ? config.toApiParams && objectToFormData(config.toApiParams(params))
            : config.toolType === ToolType.multiFile
              ? config.buildFormData(params, files)
              : config.buildFormData(params, files[0]);
        if (!form)
          throw new Error(
            `No server parameter mapping for ${operation.operation}`,
          );
        const step: BackendPipelineStep = {
          operation: endpoint,
          parameters: {},
          fileParameters: {},
        };
        for (const [key, value] of form.entries()) {
          if (key === "fileInput" || key === "fileInput[]") continue;
          if (value instanceof Blob) {
            const assetKey = `step-${index}-${key}`;
            assets.push({ key: assetKey, file: value });
            step.fileParameters![key] = assetKey;
          } else {
            const previous = step.parameters[key];
            step.parameters[key] =
              previous === undefined
                ? value
                : [...(Array.isArray(previous) ? previous : [previous]), value];
          }
        }
        return step;
      },
    );
    let currentStep = -1;
    try {
      const runId = await submitServerPipeline(
        session,
        automation.name,
        steps,
        files,
        assets,
      );
      const run = await waitForServerPipeline(session, runId, (progress) => {
        const reportedStep = Math.min(progress.currentStep, steps.length - 1);
        while (currentStep < reportedStep) {
          if (currentStep >= 0) onStepComplete?.(currentStep, []);
          currentStep++;
          onStepStart?.(
            currentStep,
            automation.operations[currentStep].operation,
          );
        }
      });
      const outputs: File[] = [];
      for (const output of run.outputs)
        outputs.push(await downloadServerPipelineOutput(session, output));
      onStepComplete?.(steps.length - 1, outputs);
      return outputs;
    } catch (error) {
      onStepError?.(
        Math.max(currentStep, 0),
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  };
