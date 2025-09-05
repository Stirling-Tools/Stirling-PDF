import { useCallback } from 'react';
import { ToolRegistry } from '../../../data/toolsTaxonomy';
import { AutomationTool } from '../../../types/automation';
import { ToolDefinition } from '../../../components/tools/shared/toolDefinition';

export function useAutomationExecutor(toolRegistry: ToolRegistry) {
  const executeStep = useCallback(async (tool: AutomationTool, files: File[]): Promise<File[]> => {
    const toolEntry = toolRegistry[tool.operation as keyof ToolRegistry];
    if (!toolEntry) {
      throw new Error(`Tool ${tool.operation} not found in registry`);
    }

    // Handle definition-based tools
    if (toolEntry.definition) {
      const definition = toolEntry.definition as ToolDefinition<unknown>;
      console.log(`🎯 Using definition-based tool: ${definition.id}`);
      
      const operation = definition.useOperation();
      const result = await operation.executeOperation(tool.parameters, files);
      
      if (!result.success) {
        throw new Error(result.error || 'Operation failed');
      }
      
      console.log(`✅ Definition-based tool returned ${result.files.length} files`);
      return result.files;
    }

    // Handle legacy tools with operationConfig
    if (toolEntry.operationConfig) {
      // Import the legacy executor function and use it
      const { executeToolOperationWithPrefix } = await import('../../../utils/automationExecutor');
      return executeToolOperationWithPrefix(
        tool.operation,
        tool.parameters || {},
        files,
        toolRegistry
      );
    }

    throw new Error(`Tool ${tool.operation} has no execution method available`);
  }, [toolRegistry]);

  const executeSequence = useCallback(async (
    tools: AutomationTool[],
    initialFiles: File[],
    onStepStart?: (stepIndex: number, operationName: string) => void,
    onStepComplete?: (stepIndex: number, resultFiles: File[]) => void,
    onStepError?: (stepIndex: number, error: string) => void
  ): Promise<File[]> => {
    let currentFiles = initialFiles;

    for (let i = 0; i < tools.length; i++) {
      const tool = tools[i];
      try {
        onStepStart?.(i, tool.operation);
        console.log(`🔄 Executing step ${i + 1}/${tools.length}: ${tool.operation}`);
        
        const resultFiles = await executeStep(tool, currentFiles);
        currentFiles = resultFiles;
        
        onStepComplete?.(i, resultFiles);
        console.log(`✅ Step ${i + 1} completed with ${resultFiles.length} files`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Step ${i + 1} failed:`, error);
        onStepError?.(i, errorMessage);
        throw new Error(`Step ${i + 1} failed: ${errorMessage}`);
      }
    }

    return currentFiles;
  }, [executeStep]);

  return {
    executeStep,
    executeSequence
  };
}