import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AutomationTool, AutomationConfig, AutomationMode } from '../../../types/automation';
import { AUTOMATION_CONSTANTS } from '../../../constants/automation';
import { ToolRegistry } from '../../../data/toolsTaxonomy';

interface UseAutomationFormProps {
  mode: AutomationMode;
  existingAutomation?: AutomationConfig;
  toolRegistry: ToolRegistry;
}

export function useAutomationForm({ mode, existingAutomation, toolRegistry }: UseAutomationFormProps) {
  const { t } = useTranslation();

  const [automationName, setAutomationName] = useState('');
  const [automationDescription, setAutomationDescription] = useState('');
  const [automationIcon, setAutomationIcon] = useState<string>('');
  const [selectedTools, setSelectedTools] = useState<AutomationTool[]>([]);

  const getToolName = useCallback((operation: string) => {
    const tool = toolRegistry?.[operation as keyof ToolRegistry] as any;
    return tool?.name || t(`tools.${operation}.name`, operation);
  }, [toolRegistry, t]);

  const getToolDefaultParameters = useCallback((operation: string): Record<string, any> => {
    const config = toolRegistry[operation as keyof ToolRegistry]?.operationConfig;
    if (config?.defaultParameters) {
      return { ...config.defaultParameters };
    }
    return {};
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
    } else if (mode === AutomationMode.CREATE && selectedTools.length === 0) {
      // Initialize with default empty tools for new automation
      const defaultTools = Array.from({ length: AUTOMATION_CONSTANTS.DEFAULT_TOOL_COUNT }, (_, index) => ({
        id: `tool-${index + 1}-${Date.now()}`,
        operation: '',
        name: t('automate.creation.tools.selectTool', 'Select a tool...'),
        configured: false,
        parameters: {}
      }));
      setSelectedTools(defaultTools);
    }
  }, [mode, existingAutomation, t, getToolName]);

  const addTool = (operation: string) => {
    const newTool: AutomationTool = {
      id: `${operation}-${Date.now()}`,
      operation,
      name: getToolName(operation),
      configured: false,
      parameters: getToolDefaultParameters(operation)
    };

    setSelectedTools([...selectedTools, newTool]);
  };

  const removeTool = (index: number) => {
    if (selectedTools.length <= AUTOMATION_CONSTANTS.MIN_TOOL_COUNT) return;
    setSelectedTools(selectedTools.filter((_, i) => i !== index));
  };

  const updateTool = (index: number, updates: Partial<AutomationTool>) => {
    const updatedTools = [...selectedTools];
    updatedTools[index] = { ...updatedTools[index], ...updates };
    setSelectedTools(updatedTools);
  };

  const hasUnsavedChanges = () => {
    return (
      automationName.trim() !== '' ||
      selectedTools.some(tool => tool.operation !== '' || tool.configured)
    );
  };

  const canSaveAutomation = () => {
    return (
      automationName.trim() !== '' &&
      selectedTools.length > 0 &&
      selectedTools.every(tool => tool.configured && tool.operation !== '')
    );
  };

  return {
    automationName,
    setAutomationName,
    automationDescription,
    setAutomationDescription,
    automationIcon,
    setAutomationIcon,
    selectedTools,
    setSelectedTools,
    addTool,
    removeTool,
    updateTool,
    hasUnsavedChanges,
    canSaveAutomation,
    getToolName,
    getToolDefaultParameters
  };
}
