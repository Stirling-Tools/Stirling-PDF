import { useState, useCallback } from 'react';
import { useFlatToolRegistry } from '../../../data/useTranslatedToolRegistry';
import { ToolComponent } from '../../../types/tool';

interface ExecutionStep {
  id: string;
  operation: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  error?: string;
  parameters?: any;
}

interface AutomationExecutionState {
  isExecuting: boolean;
  currentStepIndex: number;
  executionSteps: ExecutionStep[];
  currentFiles: File[];
}

/**
 * Hook for managing automation execution with real tool operations
 */
export const useAutomationExecution = () => {
  const toolRegistry = useFlatToolRegistry();
  const [state, setState] = useState<AutomationExecutionState>({
    isExecuting: false,
    currentStepIndex: -1,
    executionSteps: [],
    currentFiles: []
  });

  // Store operation hook instances for the current automation
  const [operationHooks, setOperationHooks] = useState<Record<string, any>>({});

  const initializeAutomation = useCallback((automation: any, initialFiles: File[]) => {
    if (!automation?.operations) return;

    const steps = automation.operations.map((op: any, index: number) => {
      const tool = toolRegistry[op.operation];
      return {
        id: `${op.operation}-${index}`,
        operation: op.operation,
        name: tool?.name || op.operation,
        status: 'pending' as const,
        parameters: op.parameters || {}
      };
    });

    // Initialize operation hooks for all tools in the automation
    const hooks: Record<string, any> = {};
    steps.forEach((step: ExecutionStep) => {
      const tool = toolRegistry[step.operation];
      if (tool?.component) {
        const toolComponent = tool.component as ToolComponent;
        if (toolComponent.tool) {
          const hookFactory = toolComponent.tool();
          // We still can't call hooks here - this approach won't work
        }
      }
    });

    setState({
      isExecuting: false,
      currentStepIndex: -1,
      executionSteps: steps,
      currentFiles: [...initialFiles]
    });
  }, [toolRegistry]);

  const executeAutomation = useCallback(async () => {
    if (state.executionSteps.length === 0 || state.currentFiles.length === 0) {
      throw new Error('No steps or files to execute');
    }

    setState(prev => ({ ...prev, isExecuting: true, currentStepIndex: 0 }));
    let filesToProcess = [...state.currentFiles];

    try {
      for (let i = 0; i < state.executionSteps.length; i++) {
        setState(prev => ({ ...prev, currentStepIndex: i }));
        const step = state.executionSteps[i];

        // Update step status to running
        setState(prev => ({
          ...prev,
          executionSteps: prev.executionSteps.map((s, idx) =>
            idx === i ? { ...s, status: 'running' } : s
          )
        }));

        // Get the tool and validate it supports automation
        const tool = toolRegistry[step.operation];
        if (!tool?.component) {
          throw new Error(`Tool not found: ${step.operation}`);
        }

        const toolComponent = tool.component as ToolComponent;
        if (!toolComponent.tool) {
          throw new Error(`Tool ${step.operation} does not support automation`);
        }

        // For now, simulate execution until we solve the hook problem
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Update step status to completed
        setState(prev => ({
          ...prev,
          executionSteps: prev.executionSteps.map((s, idx) =>
            idx === i ? { ...s, status: 'completed' } : s
          )
        }));

        // TODO: Update filesToProcess with actual results
      }

      setState(prev => ({ 
        ...prev, 
        isExecuting: false, 
        currentStepIndex: -1,
        currentFiles: filesToProcess
      }));

    } catch (error: any) {
      console.error('Automation execution failed:', error);
      setState(prev => ({
        ...prev,
        isExecuting: false,
        executionSteps: prev.executionSteps.map((s, idx) =>
          idx === prev.currentStepIndex ? { ...s, status: 'error', error: error.message } : s
        )
      }));
    }
  }, [state.executionSteps, state.currentFiles, toolRegistry]);

  return {
    ...state,
    initializeAutomation,
    executeAutomation
  };
};