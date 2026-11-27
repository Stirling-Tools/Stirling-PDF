import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  AutomationTool,
  AutomationConfig,
  AutomationMode,
} from "@editor/types/automation";
import { AUTOMATION_CONSTANTS } from "@editor/constants/automation";
import { ToolRegistry } from "@editor/data/toolsTaxonomy";
import { ToolId } from "@editor/types/toolId";
import {
  defaultToolParams,
  toolParamsNeedConfiguring,
} from "@editor/hooks/tools/shared/toolAutomation";

interface UseAutomationFormProps {
  mode: AutomationMode;
  existingAutomation?: AutomationConfig;
  toolRegistry: Partial<ToolRegistry>;
}

export function useAutomationForm({
  mode,
  existingAutomation,
  toolRegistry,
}: UseAutomationFormProps) {
  const { t } = useTranslation();

  const [automationName, setAutomationName] = useState("");
  const [automationDescription, setAutomationDescription] = useState("");
  // Default to "SettingsIcon" so the saved entry always has a valid icon key
  // matching what the IconSelector renders visually. Saving an empty string
  // here would round-trip into a fallback cog, making it look like the
  // picker silently lost the user's choice.
  const [automationIcon, setAutomationIcon] = useState<string>("SettingsIcon");
  const [selectedTools, setSelectedTools] = useState<AutomationTool[]>([]);

  const getToolName = useCallback(
    (operation: string) => {
      const tool = toolRegistry?.[operation as ToolId];
      return tool?.name || t(`tools.${operation}.name`, operation);
    },
    [toolRegistry, t],
  );

  const getToolDefaultParameters = useCallback(
    (operation: string) => defaultToolParams(operation as ToolId, toolRegistry),
    [toolRegistry],
  );

  const isToolConfigured = useCallback(
    (tool: AutomationTool) =>
      tool.operation !== "" &&
      !toolParamsNeedConfiguring(
        tool.operation as ToolId,
        tool.parameters ?? {},
        toolRegistry,
      ),
    [toolRegistry],
  );

  // Initialize based on mode and existing automation
  useEffect(() => {
    if (
      (mode === AutomationMode.SUGGESTED || mode === AutomationMode.EDIT) &&
      existingAutomation
    ) {
      setAutomationName(existingAutomation.name || "");
      setAutomationDescription(existingAutomation.description || "");
      setAutomationIcon(existingAutomation.icon || "SettingsIcon");

      const operations = existingAutomation.operations || [];
      const tools = operations.map((op, index) => {
        const operation = typeof op === "string" ? op : op.operation;
        return {
          id: `${operation}-${Date.now()}-${index}`,
          operation: operation,
          name: getToolName(operation),
          parameters:
            typeof op === "object"
              ? {
                  ...getToolDefaultParameters(operation),
                  ...(op.parameters || {}),
                }
              : getToolDefaultParameters(operation),
        };
      });

      setSelectedTools(tools);
    } else if (mode === AutomationMode.CREATE && selectedTools.length === 0) {
      // Initialize with default empty tools for new automation
      const defaultTools = Array.from(
        { length: AUTOMATION_CONSTANTS.DEFAULT_TOOL_COUNT },
        (_, index) => ({
          id: `tool-${index + 1}-${Date.now()}`,
          operation: "",
          name: t("automate.creation.tools.selectTool", "Select a tool..."),
          parameters: {},
        }),
      );
      setSelectedTools(defaultTools);
    }
  }, [mode, existingAutomation, t, getToolName, getToolDefaultParameters]);

  const addTool = (operation: string) => {
    const newTool: AutomationTool = {
      id: `${operation}-${Date.now()}`,
      operation,
      name: getToolName(operation),
      parameters: getToolDefaultParameters(operation),
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
      automationName.trim() !== "" ||
      selectedTools.some((tool) => tool.operation !== "")
    );
  };

  const canSaveAutomation = () => {
    return (
      automationName.trim() !== "" &&
      selectedTools.length > 0 &&
      selectedTools.every(isToolConfigured)
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
    isToolConfigured,
    getToolName,
    getToolDefaultParameters,
  };
}
