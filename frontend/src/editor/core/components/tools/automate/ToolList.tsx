import React from "react";
import { useTranslation } from "react-i18next";
import { Text, Stack, Group } from "@mantine/core";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { Icon } from "@editor/ui/Icon";
import { Tooltip } from "@editor/components/shared/Tooltip";
import { AutomationTool } from "@editor/types/automation";
import { ToolRegistry } from "@editor/data/toolsTaxonomy";
import { ToolId } from "@editor/types/toolId";
import { AUTOMATION_CONSTANTS } from "@editor/constants/automation";
import ToolSelector from "@editor/components/tools/automate/ToolSelector";
import AutomationEntry from "@editor/components/tools/automate/AutomationEntry";

interface ToolListProps {
  tools: AutomationTool[];
  toolRegistry: Partial<ToolRegistry>;
  onToolUpdate: (index: number, updates: Partial<AutomationTool>) => void;
  onToolRemove: (index: number) => void;
  onToolConfigure: (index: number) => void;
  onToolAdd: () => void;
  getToolName: (operation: string) => string;
  getToolDefaultParameters: (operation: string) => Record<string, unknown>;
}

function StepArrow() {
  return (
    <div
      aria-hidden
      style={{
        display: "flex",
        justifyContent: "center",
        padding: "6px 0",
        color: "var(--c-text-subtle)",
      }}
    >
      <Icon name="arrow-down" size={14} />
    </div>
  );
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
  const canRemove = tools.length > AUTOMATION_CONSTANTS.MIN_TOOL_COUNT;

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
      <Text size="sm" fw={500} mb="xs">
        {t("automate.creation.tools.selected", "Selected Tools")} (
        {tools.length})
      </Text>
      <Stack gap="0">
        {tools.map((tool, index) => (
          <React.Fragment key={tool.id}>
            <div
              style={{
                border: "1px solid var(--c-border-subtle)",
                borderRadius:
                  tool.operation && !tool.configured
                    ? "var(--mantine-radius-md) var(--mantine-radius-md) 0 0"
                    : "var(--mantine-radius-md)",
                backgroundColor: "var(--c-surface-sunken)",
                position: "relative",
                padding: "var(--mantine-spacing-xs)",
                borderBottomWidth:
                  tool.operation && !tool.configured ? "0" : "1px",
              }}
            >
              <Group gap="xs" align="center" wrap="nowrap">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <ToolSelector
                    key={`tool-selector-${tool.id}`}
                    onSelect={(newOperation) =>
                      handleToolSelect(index, newOperation)
                    }
                    excludeTools={["automate"]}
                    toolRegistry={toolRegistry}
                    selectedValue={tool.operation}
                    placeholder={tool.name}
                  />
                </div>

                <Group gap={2} wrap="nowrap">
                  {tool.operation && (
                    <Tooltip
                      content={t(
                        "automate.creation.tools.configure",
                        "Configure tool",
                      )}
                      position="top"
                    >
                      <ActionIcon
                        variant="quiet"
                        size="sm"
                        onClick={() => onToolConfigure(index)}
                        aria-label={t(
                          "automate.creation.tools.configure",
                          "Configure tool",
                        )}
                        style={{ color: "var(--c-text-muted)" }}
                      >
                        <Icon name="settings" size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  {canRemove && (
                    <Tooltip
                      content={t(
                        "automate.creation.tools.remove",
                        "Remove tool",
                      )}
                      position="top"
                    >
                      <ActionIcon
                        variant="quiet"
                        size="sm"
                        onClick={() => onToolRemove(index)}
                        aria-label={t(
                          "automate.creation.tools.remove",
                          "Remove tool",
                        )}
                        style={{ color: "var(--c-text-muted)" }}
                      >
                        <Icon name="x" size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              </Group>
            </div>
            {tool.operation && !tool.configured && (
              <button
                type="button"
                onClick={() => onToolConfigure(index)}
                aria-label={t(
                  "automate.creation.tools.configureTool",
                  "Configure {{name}}",
                  { name: tool.name },
                )}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  width: "100%",
                  border: "1px solid var(--c-warning)",
                  borderTop: "none",
                  borderRadius:
                    "0 0 var(--mantine-radius-md) var(--mantine-radius-md)",
                  backgroundColor: "var(--c-warning-subtle)",
                  color: "var(--c-warning)",
                  padding: "var(--mantine-spacing-xs)",
                  textAlign: "left",
                  font: "inherit",
                  cursor: "pointer",
                }}
              >
                <Icon name="triangle-alert" size={14} />
                <Text size="xs" fw={500}>
                  {t(
                    "automate.creation.tools.notConfigured",
                    "Configuration required",
                  )}
                </Text>
              </button>
            )}
            {index < tools.length - 1 && <StepArrow />}
          </React.Fragment>
        ))}

        {tools.length > 0 && <StepArrow />}

        <div
          style={{
            border: "1px solid var(--c-border-subtle)",
            borderRadius: "var(--mantine-radius-sm)",
            overflow: "hidden",
          }}
        >
          <AutomationEntry
            title={t("automate.creation.tools.addTool", "Add Tool")}
            badgeIcon="circle-plus"
            operations={[]}
            onClick={onToolAdd}
            keepIconColor={true}
          />
        </div>
      </Stack>
    </div>
  );
}
