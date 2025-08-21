import React, { useEffect, useState } from 'react';
import { useFlatToolRegistry } from '../../../data/useTranslatedToolRegistry';
import { ToolComponent } from '../../../types/tool';

interface AutomationExecutorProps {
  automation: any;
  files: File[];
  onStepStart: (stepIndex: number) => void;
  onStepComplete: (stepIndex: number, results: File[]) => void;
  onStepError: (stepIndex: number, error: string) => void;
  onComplete: (finalResults: File[]) => void;
  shouldExecute: boolean;
}

/**
 * Component that manages the execution of automation steps using real tool hooks.
 * This component creates operation hook instances for each tool in the automation.
 */
export const AutomationExecutor: React.FC<AutomationExecutorProps> = ({
  automation,
  files,
  onStepStart,
  onStepComplete,
  onStepError,
  onComplete,
  shouldExecute
}) => {
  const toolRegistry = useFlatToolRegistry();
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [currentFiles, setCurrentFiles] = useState<File[]>(files);
  const [isExecuting, setIsExecuting] = useState(false);

  // Create operation hooks for all tools in the automation
  const operationHooks = React.useMemo(() => {
    if (!automation?.operations) return {};

    const hooks: Record<string, any> = {};
    automation.operations.forEach((op: any, index: number) => {
      const tool = toolRegistry[op.operation];
      if (tool?.component) {
        const toolComponent = tool.component as ToolComponent;
        if ('tool' in toolComponent) {
          // We still can't call the hook here dynamically
          // This approach also won't work
        }
      }
    });

    return hooks;
  }, [automation, toolRegistry]);

  // Execute automation when shouldExecute becomes true
  useEffect(() => {
    if (shouldExecute && !isExecuting && automation?.operations?.length > 0) {
      executeAutomation();
    }
  }, [shouldExecute, isExecuting, automation]);

  const executeAutomation = async () => {
    if (!automation?.operations || automation.operations.length === 0) {
      return;
    }

    setIsExecuting(true);
    setCurrentFiles(files);
    let filesToProcess = [...files];

    try {
      for (let i = 0; i < automation.operations.length; i++) {
        setCurrentStepIndex(i);
        const operation = automation.operations[i];

        onStepStart(i);

        // Get the tool
        const tool = toolRegistry[operation.operation];
        if (!tool?.component) {
          throw new Error(`Tool not found: ${operation.operation}`);
        }

        const toolComponent = tool.component as ToolComponent;
        if (!('tool' in toolComponent)) {
          throw new Error(`Tool ${operation.operation} does not support automation`);
        }

        // For now, simulate the execution
        // TODO: We need to find a way to actually execute the tool operation
        await new Promise(resolve => setTimeout(resolve, 2000));

        // For now, assume the operation succeeded with the same files
        const resultFiles = filesToProcess; // TODO: Get actual results

        onStepComplete(i, resultFiles);
        filesToProcess = resultFiles;
        setCurrentFiles(resultFiles);
      }

      onComplete(filesToProcess);
      setIsExecuting(false);
      setCurrentStepIndex(-1);

    } catch (error: any) {
      console.error('Automation execution failed:', error);
      onStepError(currentStepIndex, error.message);
      setIsExecuting(false);
      setCurrentStepIndex(-1);
    }
  };

  // This component doesn't render anything visible
  return null;
};