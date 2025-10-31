import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AutomationTool,
  AutomationConfig,
  AutomationMode,
  AutomateToolId,
  AutomateToolRegistry,
} from '@app/types/automation';
import { AUTOMATION_CONSTANTS } from '@app/constants/automation';


interface UseAutomationFormProps {
  mode: AutomationMode;
  existingAutomation?: AutomationConfig;
  toolRegistry: AutomateToolRegistry;
}

export function useAutomationForm({ mode, existingAutomation, toolRegistry }: UseAutomationFormProps) {
  const { t } = useTranslation();

  const [automationName, setAutomationName] = useState('');
  const [automationDescription, setAutomationDescription] = useState('');
  const [automationIcon, setAutomationIcon] = useState<string>('');
  const [selectedTools, setSelectedTools] = useState<AutomationTool[]>([]);

  const getToolName = useCallback((operation: AutomateToolId) => {
    const tool = toolRegistry[operation];
    return tool?.name || t(`tools.${operation}.name`, operation);
  }, [toolRegistry, t]);

  const getToolDefaultParameters = useCallback((operation: AutomateToolId): Record<string, any> => {
    const config = toolRegistry[operation]?.operationConfig;
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
        const operation = op.operation;
        const toolEntry = toolRegistry[operation];
        // If tool has no settingsComponent, it's automatically configured
        const isConfigured = mode === AutomationMode.EDIT ? true : !toolEntry?.automationSettings;

        return {
          id: `${operation}-${Date.now()}-${index}`,
          operation: operation,
          name: getToolName(operation),
          configured: isConfigured,
          parameters: typeof op === 'object' ? op.parameters || {} : {}
        };
      });

      setSelectedTools(tools);
    } else if (mode === AutomationMode.CREATE && selectedTools.length === 0) {
      // Initialize with default empty tools for new automation
      const defaultTools: AutomationTool[] = Array.from(
        { length: AUTOMATION_CONSTANTS.DEFAULT_TOOL_COUNT },
        (_, index): AutomationTool => ({
          id: `tool-${index + 1}-${Date.now()}`,
          operation: '',
          name: t('automate.creation.tools.selectTool', 'Select a tool...'),
          configured: false,
          parameters: {}
        })
      );
      setSelectedTools(defaultTools);
    }
  }, [mode, existingAutomation, t, getToolName]);

  const addTool = (operation: AutomateToolId) => {
    const toolEntry = toolRegistry[operation];
    // If tool has no settingsComponent, it's automatically configured
    const isConfigured = !toolEntry?.automationSettings;

    const newTool: AutomationTool = {
      id: `${operation}-${Date.now()}`,
      operation,
      name: getToolName(operation),
      configured: isConfigured,
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
