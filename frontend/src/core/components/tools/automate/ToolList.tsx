import React from "react";
import { useTranslation } from "react-i18next";
import { Text, Stack, Group, ActionIcon } from "@mantine/core";
import SettingsIcon from "@mui/icons-material/Settings";
import CloseIcon from "@mui/icons-material/Close";
import AddCircleOutline from "@mui/icons-material/AddCircleOutline";
import { AutomationTool } from "@app/types/automation";
import { ToolRegistry } from "@app/data/toolsTaxonomy";
import { ToolId } from "@app/types/toolId";
import ToolSelector from "@app/components/tools/automate/ToolSelector";
import AutomationEntry from "@app/components/tools/automate/AutomationEntry";

interface ToolListProps {
  tools: AutomationTool[];
  toolRegistry: Partial<ToolRegistry>;
  onToolUpdate: (index: number, updates: Partial<AutomationTool>) => void;
  onToolRemove: (index: number) => void;
  onToolConfigure: (index: number) => void;
  onToolAdd: () => void;
  getToolName: (operation: string) => string;
  getToolDefaultParameters: (operation: string) => Record<string, any>;
}

export default function ToolList({
  tools,
  toolRegistry,
  onToolUpdate,
  onToolRemove,
  onToolConfigure,
  onToolAdd,
  getToolName,
  getToolDefaultParameters,
}: ToolListProps) {
  const { t } = useTranslation();

  const handleToolSelect = (index: number, newOperation: string) => {
    const defaultParams = getToolDefaultParameters(newOperation);
    const toolEntry = toolRegistry[newOperation as ToolId];
    // If tool has no settingsComponent, it's automatically configured
    const isConfigured = !toolEntry?.automationSettings;

    onToolUpdate(index, {
      operation: newOperation,
      name: getToolName(newOperation),
      configured: isConfigured,
      parameters: defaultParams,
    });
  };

  return (
    <div>
      <Text size="sm" fw={500} mb="xs" style={{ color: "var(--mantine-color-text)" }}>
        {t("automate.creation.tools.selected", "Selected Tools")} ({tools.length})
      </Text>
      <Stack gap="0">
        {tools.map((tool, index) => (
          <React.Fragment key={tool.id}>
            <div
              style={{
                border: "1px solid var(--mantine-color-gray-2)",
                borderRadius: tool.operation && !tool.configured
                  ? "var(--mantine-radius-lg) var(--mantine-radius-lg) 0 0"
                  : "var(--mantine-radius-lg)",
                backgroundColor: "var(--mantine-color-gray-2)",
                position: "relative",
                padding: "var(--mantine-spacing-xs)",
                borderBottomWidth: tool.operation && !tool.configured ? "0" : "1px",
              }}
            >
              {/* Delete X in top right - only show for tools after the first 2 */}
              {index > 1 && (
                <ActionIcon
                  variant="subtle"
                  size="xs"
                  onClick={() => onToolRemove(index)}
                  title={t("automate.creation.tools.remove", "Remove tool")}
                  style={{
                    position: "absolute",
                    top: "4px",
                    right: "4px",
                    zIndex: 1,
                    color: "var(--mantine-color-gray-6)",
                  }}
                >
                  <CloseIcon style={{ fontSize: 16 }} />
                </ActionIcon>
              )}

              <div style={{ paddingRight: "1.25rem" }}>
                {/* Tool Selection Dropdown with inline settings cog */}
                <Group gap="xs" align="center" wrap="nowrap">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <ToolSelector
                      key={`tool-selector-${tool.id}`}
                      onSelect={(newOperation) => handleToolSelect(index, newOperation)}
                      excludeTools={["automate"]}
                      toolRegistry={toolRegistry}
                      selectedValue={tool.operation}
                      placeholder={tool.name}
                    />
                  </div>

                  {/* Settings cog - only show if tool is selected, aligned right */}
                  {tool.operation && (
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      onClick={() => onToolConfigure(index)}
                      title={t("automate.creation.tools.configure", "Configure tool")}
                      style={{ color: "var(--mantine-color-gray-6)" }}
                    >
                      <SettingsIcon style={{ fontSize: 16 }} />
                    </ActionIcon>
                  )}
                </Group>
              </div>
            </div>
            {/* Configuration status underneath */}
            {tool.operation && !tool.configured && (
              <div
                style={{
                  width: "100%",
                  border: "1px solid var(--mantine-color-gray-2)",
                  borderTop: "none",
                  borderRadius: "0 0 var(--mantine-radius-lg) var(--mantine-radius-lg)",
                  backgroundColor: "var(--active-bg)",
                  padding: "var(--mantine-spacing-xs)",
                }}
              >
                <Text pl="md" size="xs" >
                  {t("automate.creation.tools.notConfigured", "! Not Configured")}
                </Text>
              </div>
            )}
            {index < tools.length - 1 && (
              <div style={{ textAlign: "center", padding: "8px 0" }}>
                <Text size="xs" c="dimmed">
                  ↓
                </Text>
              </div>
            )}
          </React.Fragment>
        ))}

        {/* Arrow before Add Tool Button */}
        {tools.length > 0 && (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <Text size="xs" c="dimmed">
              ↓
            </Text>
          </div>
        )}

        {/* Add Tool Button */}
        <div
          style={{
            border: "1px solid var(--mantine-color-gray-2)",
            borderRadius: "var(--mantine-radius-sm)",
            overflow: "hidden",
          }}
        >
          <AutomationEntry
            title={t("automate.creation.tools.addTool", "Add Tool")}
            badgeIcon={AddCircleOutline}
            operations={[]}
            onClick={onToolAdd}
            keepIconColor={true}
          />
        </div>
      </Stack>
    </div>
  );
}
