import { ToolRegistry } from '../data/toolsTaxonomy';
import { ToolDefinition } from '../components/tools/shared/toolDefinition';
import { AutomationTool } from '../types/automation';

/**
 * Enhanced automation executor that works with both definition-based and legacy tools
 */
export class EnhancedAutomationExecutor {
  constructor(private toolRegistry: ToolRegistry) {}

  /**
   * Execute a single automation step
   */
  async executeStep(tool: AutomationTool, files: File[]): Promise<File[]> {
    const toolEntry = this.toolRegistry[tool.operation as keyof ToolRegistry];
    if (!toolEntry) {
      throw new Error(`Tool ${tool.operation} not found in registry`);
    }

    // Check if it's a definition-based tool
    if (toolEntry.definition) {
      return this.executeDefinitionBasedStep(toolEntry.definition as ToolDefinition<unknown>, tool, files);
    }

    // Check if it has legacy operationConfig
    if (toolEntry.operationConfig) {
      return this.executeLegacyStep(toolEntry.operationConfig, tool, files);
    }

    throw new Error(`Tool ${tool.operation} has no execution method available`);
  }

  /**
   * Execute a step using a tool definition
   */
  private async executeDefinitionBasedStep(
    definition: ToolDefinition<unknown>, 
    tool: AutomationTool, 
    files: File[]
  ): Promise<File[]> {
    // Create the operation hook instance
    const operationHook = definition.useOperation();
    
    // Execute the operation with the tool's parameters and files
    await operationHook.executeOperation(tool.parameters, files);
    
    // Return the resulting files
    return operationHook.files;
  }

  /**
   * Execute a step using legacy operation config
   */
  private async executeLegacyStep(
    operationConfig: any, 
    tool: AutomationTool, 
    files: File[]
  ): Promise<File[]> {
    // This would use the existing legacy execution logic
    // Implementation depends on the current operationConfig structure
    console.log('Executing legacy step:', tool.operation, tool.parameters);
    
    // Placeholder - return files unchanged for now
    return files;
  }

  /**
   * Execute a complete automation workflow
   */
  async executeWorkflow(tools: AutomationTool[], initialFiles: File[]): Promise<File[]> {
    let currentFiles = initialFiles;

    for (const tool of tools) {
      try {
        currentFiles = await this.executeStep(tool, currentFiles);
        console.log(`Step ${tool.operation} completed, ${currentFiles.length} files`);
      } catch (error) {
        console.error(`Step ${tool.operation} failed:`, error);
        throw new Error(`Automation failed at step: ${tool.operation}`);
      }
    }

    return currentFiles;
  }

  /**
   * Get tool information for automation UI
   */
  getToolInfo(operation: string) {
    const toolEntry = this.toolRegistry[operation as keyof ToolRegistry];
    if (!toolEntry) return null;

    return {
      name: toolEntry.name,
      hasDefinition: !!toolEntry.definition,
      hasLegacyConfig: !!toolEntry.operationConfig,
      isAutomatable: !!(toolEntry.definition || toolEntry.operationConfig)
    };
  }

  /**
   * Get default parameters for a tool
   */
  getDefaultParameters(operation: string): Record<string, unknown> {
    const toolEntry = this.toolRegistry[operation as keyof ToolRegistry];
    if (!toolEntry) return {};

    if (toolEntry.definition) {
      // For definition-based tools, we'd need to instantiate the parameters hook
      // This is complex in a static context, so for now return empty object
      return {};
    }

    if (toolEntry.operationConfig?.defaultParameters) {
      return { ...toolEntry.operationConfig.defaultParameters };
    }

    return {};
  }

  /**
   * Validate that an automation workflow is executable
   */
  validateWorkflow(tools: AutomationTool[]): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const tool of tools) {
      const toolInfo = this.getToolInfo(tool.operation);
      
      if (!toolInfo) {
        errors.push(`Tool '${tool.operation}' not found`);
        continue;
      }

      if (!toolInfo.isAutomatable) {
        errors.push(`Tool '${tool.operation}' is not automatable`);
        continue;
      }

      if (!tool.configured) {
        errors.push(`Tool '${tool.operation}' is not configured`);
        continue;
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}