import { ToolType, useToolOperation } from '@app/hooks/tools/shared/useToolOperation';
import { useCallback } from 'react';
import { executeAutomationSequence } from '@app/utils/automationExecutor';
import { useToolRegistry } from '@app/contexts/ToolRegistryContext';
import { AutomateParameters } from '@app/types/automation';

export function useAutomateOperation() {
  const { allTools } = useToolRegistry();
  const toolRegistry = allTools;

  const customProcessor = useCallback(async (params: AutomateParameters, files: File[]) => {
    console.log('🚀 Starting automation execution via customProcessor', { params, files });

    if (!params.automationConfig) {
      throw new Error('No automation configuration provided');
    }

    // Execute the automation sequence and return the final results
    const finalResults = await executeAutomationSequence(
      params.automationConfig!,
      files,
      toolRegistry,
      (stepIndex: number, operationName: string) => {
        console.log(`Step ${stepIndex + 1} started: ${operationName}`);
        params.onStepStart?.(stepIndex, operationName);
      },
      (stepIndex: number, resultFiles: File[]) => {
        console.log(`Step ${stepIndex + 1} completed with ${resultFiles.length} files`);
        params.onStepComplete?.(stepIndex, resultFiles);
      },
      (stepIndex: number, error: string) => {
        console.error(`Step ${stepIndex + 1} failed:`, error);
        params.onStepError?.(stepIndex, error);
        throw new Error(`Automation step ${stepIndex + 1} failed: ${error}`);
      }
    );

    console.log(`✅ Automation completed, returning ${finalResults.length} files`);
    return {
      files: finalResults,
      consumedAllInputs: true,
    };
  }, [toolRegistry]);

  return useToolOperation<AutomateParameters>({
    toolType: ToolType.custom,
    operationType: 'automate',
    customProcessor,
    consumesAllInputs: true,
  });
}
