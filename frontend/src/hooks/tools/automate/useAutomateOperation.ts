import { ToolType, useToolOperation } from '../shared/useToolOperation';
import { useCallback } from 'react';
import { executeAutomationSequence } from '../../../utils/automationExecutor';
import { useFlatToolRegistry } from '../../../data/useTranslatedToolRegistry';
import { AutomateParameters } from '../../../types/automation';
import { AUTOMATION_CONSTANTS } from '../../../constants/automation';

export function useAutomateOperation() {
  const toolRegistry = useFlatToolRegistry();

  const customProcessor = useCallback(async (params: AutomateParameters, files: File[]) => {
    console.log('🚀 Starting automation execution via customProcessor', { params, files });

    if (!params.automationConfig) {
      throw new Error('No automation configuration provided');
    }

    console.log('🔍 Full automation config:', params.automationConfig);
    
    // Execute the automation sequence using the regular executor
    const finalResults = await executeAutomationSequence(
      params.automationConfig,
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
      }
    );

    console.log(`✅ Automation completed, returning ${finalResults.length} files`);
    return finalResults;
  }, [toolRegistry]);

  return useToolOperation<AutomateParameters>({
    toolType: ToolType.custom,
    operationType: 'automate',
    customProcessor,
    filePrefix: '' // No prefix needed since automation handles naming internally
  });
}
