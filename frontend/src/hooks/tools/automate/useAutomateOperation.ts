import { useToolOperation } from '../shared/useToolOperation';
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
    return finalResults;
  }, [toolRegistry]);

  return useToolOperation<AutomateParameters>({
    operationType: 'automate',
    endpoint: '/api/v1/pipeline/handleData', // Not used with customProcessor
    buildFormData: () => new FormData(), // Not used with customProcessor
    customProcessor,
    filePrefix: AUTOMATION_CONSTANTS.FILE_PREFIX
  });
}