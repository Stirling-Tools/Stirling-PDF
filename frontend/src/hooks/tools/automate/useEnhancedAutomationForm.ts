import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AutomationTool, AutomationConfig, AutomationMode } from '../../../types/automation';
import { AUTOMATION_CONSTANTS } from '../../../constants/automation';
import { ToolRegistry } from '../../../data/toolsTaxonomy';
import { ToolDefinition } from '../../../components/tools/shared/toolDefinition';

interface UseEnhancedAutomationFormProps {
  mode: AutomationMode;
  existingAutomation?: AutomationConfig;
  toolRegistry: ToolRegistry;
}

/**
 * Enhanced automation form hook that works with both definition-based and legacy tools
 */
export function useEnhancedAutomationForm({ mode, existingAutomation, toolRegistry }: UseEnhancedAutomationFormProps) {
  const { t } = useTranslation();

  const [automationName, setAutomationName] = useState('');
  const [automationDescription, setAutomationDescription] = useState('');
  const [automationIcon, setAutomationIcon] = useState<string>('');
  const [selectedTools, setSelectedTools] = useState<AutomationTool[]>([]);

  const getToolName = useCallback((operation: string) => {
    const tool = toolRegistry?.[operation as keyof ToolRegistry] as any;
    return tool?.name || t(`tools.${operation}.name`, operation);
  }, [toolRegistry, t]);

  const getToolDefaultParameters = useCallback((operation: string): Record<string, unknown> => {
    const toolEntry = toolRegistry[operation as keyof ToolRegistry];
    if (!toolEntry) return {};

    // Check if it's a definition-based tool
    if (toolEntry.definition) {
      const definition = toolEntry.definition as ToolDefinition<unknown>;
      
      // For definition-based tools, we need to get defaults from the parameters hook
      // This is tricky because we can't call hooks here, but we can provide sensible defaults
      // TODO: Consider creating a static defaultParameters method on definitions
      
      // For now, return empty object - the definition components should handle their own defaults
      return {};
    }

    // Legacy operationConfig approach
    const config = toolEntry.operationConfig;
    if (config?.defaultParameters) {
      return { ...config.defaultParameters };
    }
    
    return {};
  }, [toolRegistry]);

  /**
   * Get list of automatable tools from the registry
   * Includes both definition-based and legacy tools with settingsComponent
   */
  const getAutomatableTools = useCallback(() => {
    return Object.entries(toolRegistry)
      .filter(([_, toolEntry]) => {
        // Include definition-based tools OR legacy tools with settings
        return toolEntry.definition || toolEntry.settingsComponent;
      })
      .map(([toolId, toolEntry]) => ({
        id: toolId,
        name: toolEntry.name,
        hasDefinition: !!toolEntry.definition,
        hasLegacySettings: !!toolEntry.settingsComponent
      }));
  }, [toolRegistry]);

  /**
   * Check if a tool supports automation
   */
  const isToolAutomatable = useCallback((operation: string) => {
    const toolEntry = toolRegistry[operation as keyof ToolRegistry];
    return !!(toolEntry?.definition || toolEntry?.settingsComponent);
  }, [toolRegistry]);

  // Initialize based on mode and existing automation
  useEffect(() => {
    if ((mode === AutomationMode.SUGGESTED || mode === AutomationMode.EDIT) && existingAutomation) {
      setAutomationName(existingAutomation.name || '');
      setAutomationDescription(existingAutomation.description || '');
      setAutomationIcon(existingAutomation.icon || '');

      const operations = existingAutomation.operations || [];
      const tools = operations.map((op, index) => {
        const operation = typeof op === 'string' ? op : op.operation;
        return {
          id: `${operation}-${Date.now()}-${index}`,
          operation: operation,
          name: getToolName(operation),
          configured: mode === AutomationMode.EDIT ? true : false,
          parameters: typeof op === 'object' ? op.parameters || {} : {}
        };
      });
      setSelectedTools(tools);
    } else {
      // Creating new automation
      setAutomationName('');
      setAutomationDescription('');
      setAutomationIcon('');
      setSelectedTools([]);
    }
  }, [mode, existingAutomation, getToolName]);

  const addTool = useCallback((operation: string) => {
    if (!isToolAutomatable(operation)) {
      console.warn(`Tool ${operation} is not automatable`);
      return;
    }

    const newTool: AutomationTool = {
      id: `${operation}-${Date.now()}`,
      operation,
      name: getToolName(operation),
      configured: false,
      parameters: getToolDefaultParameters(operation)
    };
    setSelectedTools(prev => [...prev, newTool]);
  }, [getToolName, getToolDefaultParameters, isToolAutomatable]);

  const removeTool = useCallback((toolId: string) => {
    setSelectedTools(prev => prev.filter(tool => tool.id !== toolId));
  }, []);

  const updateTool = useCallback((toolId: string, updates: Partial<AutomationTool>) => {
    setSelectedTools(prev => prev.map(tool => 
      tool.id === toolId ? { ...tool, ...updates } : tool
    ));
  }, []);

  const hasUnsavedChanges = selectedTools.length > 0 || automationName.trim() !== '';

  const canSaveAutomation = automationName.trim() !== '' && 
    selectedTools.length > 0 && 
    selectedTools.every(tool => tool.configured);

  return {
    automationName,
    setAutomationName,
    automationDescription,
    setAutomationDescription,
    automationIcon,
    setAutomationIcon,
    selectedTools,
    addTool,
    removeTool,
    updateTool,
    hasUnsavedChanges,
    canSaveAutomation,
    getToolName,
    getToolDefaultParameters,
    getAutomatableTools,
    isToolAutomatable
  };
}