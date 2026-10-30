import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  AutomationTool,
  AutomationConfig,
  AutomationMode,
} from "@editor/types/automation";
import { AUTOMATION_CONSTANTS } from "@editor/constants/automation";
import { ToolRegistry } from "@editor/data/toolsTaxonomy";
import { ToolId } from "@editor/types/toolId";

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
    (operation: string): Record<string, unknown> => {
      const config = toolRegistry[operation as ToolId]?.operationConfig;
      if (config?.defaultParameters) {
        return { ...config.defaultParameters };
      }
      return {};
    },
    [toolRegistry],
  );

  // Dirty-check against the form as it was initialised, not against the saved
  // config: defaults merged into step parameters would otherwise make an
  // untouched edit look changed and prompt on Cancel.
  const initialSnapshotRef = useRef<string | null>(null);
  const serializeForm = useCallback(
    (
      name: string,
      description: string,
      icon: string,
      tools: AutomationTool[],
    ) =>
      JSON.stringify({
        name: name.trim(),
        description: description.trim(),
        icon,
        operations: tools
          .filter((tool) => tool.operation !== "")
          .map((tool) => ({
            operation: tool.operation,
            parameters: tool.parameters ?? {},
          })),
      }),
    [],
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
        const toolEntry = toolRegistry[operation as ToolId];
        // If tool has no settingsComponent, it's automatically configured
        const isConfigured =
          mode === AutomationMode.EDIT || mode === AutomationMode.SUGGESTED
            ? true
            : !toolEntry?.automationSettings;

        return {
          id: `${operation}-${Date.now()}-${index}`,
          operation: operation,
          name: getToolName(operation),
          configured: isConfigured,
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
      initialSnapshotRef.current = serializeForm(
        existingAutomation.name || "",
        existingAutomation.description || "",
        existingAutomation.icon || "SettingsIcon",
        tools,
      );
    } else if (mode === AutomationMode.CREATE && selectedTools.length === 0) {
      // Initialize with default empty tools for new automation
      const defaultTools = Array.from(
        { length: AUTOMATION_CONSTANTS.DEFAULT_TOOL_COUNT },
        (_, index) => ({
          id: `tool-${index + 1}-${Date.now()}`,
          operation: "",
          name: t("automate.creation.tools.selectTool", "Select a tool..."),
          configured: false,
          parameters: {},
        }),
      );
      setSelectedTools(defaultTools);
      initialSnapshotRef.current = serializeForm(
        "",
        "",
        "SettingsIcon",
        defaultTools,
      );
    }
  }, [
    mode,
    existingAutomation,
    t,
    getToolName,
    getToolDefaultParameters,
    serializeForm,
  ]);

  const addTool = (operation: string) => {
    const toolEntry = toolRegistry[operation as ToolId];
    // If tool has no settingsComponent, it's automatically configured
    const isConfigured = !toolEntry?.automationSettings;

    const newTool: AutomationTool = {
      id: `${operation}-${Date.now()}`,
      operation,
      name: getToolName(operation),
      configured: isConfigured,
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
    if (initialSnapshotRef.current === null) return false;
    return (
      serializeForm(
        automationName,
        automationDescription,
        automationIcon,
        selectedTools,
      ) !== initialSnapshotRef.current
    );
  };

  const canSaveAutomation = () => {
    return (
      automationName.trim() !== "" &&
      selectedTools.length > 0 &&
      selectedTools.every((tool) => tool.configured && tool.operation !== "")
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
    getToolDefaultParameters,
  };
}
