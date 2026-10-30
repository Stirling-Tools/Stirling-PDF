import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Group, Text, Menu, Box } from "@mantine/core";
import { Button as SharedButton } from "@editor/ui/Button";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { Icon, type IconName } from "@editor/ui/Icon";
import { Tooltip } from "@editor/components/shared/Tooltip";
import { ToolIcon } from "@editor/components/shared/ToolIcon";
import { ToolRegistry } from "@editor/data/toolsTaxonomy";
import { ToolId } from "@editor/types/toolId";

interface AutomationEntryProps {
  /** Optional title for the automation (usually for custom ones) */
  title?: string;
  /** Optional description for tooltip */
  description?: string;
  /** MUI Icon component for the badge */
  badgeIcon?: IconName;
  /** Array of tool operation names in the workflow */
  operations: string[];
  /** Click handler */
  onClick: () => void;
  /** Whether to keep the icon at normal color (for special cases like "Add New") */
  keepIconColor?: boolean;
  /** Show menu for saved/suggested automations */
  showMenu?: boolean;
  /** Edit handler */
  onEdit?: () => void;
  /** Delete handler */
  onDelete?: () => void;
  /** Copy handler (for suggested automations) */
  onCopy?: () => void;
  /** Export handler — folder scanning JSON */
  onExportFolderScan?: () => void;
  /** Export handler — native Automate JSON (renders as just "Export") */
  onExportAutomation?: () => void;
  /** Import handler — opens the import modal (used on "Create New" entry) */
  onImport?: () => void;
  /** Tool registry to resolve operation names */
  toolRegistry?: Partial<ToolRegistry>;
}

export default function AutomationEntry({
  title,
  description,
  badgeIcon,
  operations,
  onClick,
  keepIconColor = false,
  showMenu = false,
  onEdit,
  onDelete,
  onCopy,
  onExportFolderScan,
  onExportAutomation,
  onImport,
  toolRegistry,
}: AutomationEntryProps) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Helper function to resolve tool display names
  const getToolDisplayName = (operation: string): string => {
    const entry = toolRegistry?.[operation as ToolId];
    if (entry?.name) {
      return entry.name;
    }
    // Fallback to translation or operation key
    return t(`${operation}.title`, operation);
  };

  // Create tooltip content with description and tool chain
  const createTooltipContent = () => {
    // Show tooltip if there's a description OR if there are operations to show in the chain
    if (!description && operations.length === 0) return null;

    const toolChain = operations.map((op, index) => (
      <React.Fragment key={`${op}-${index}`}>
        <Text
          component="span"
          size="sm"
          fw={600}
          style={{
            color: "var(--c-accent-fg, var(--c-primary))",
            background: "var(--c-primary-subtle)",
            padding: "2px 6px",
            borderRadius: "4px",
            fontSize: "0.75rem",
            whiteSpace: "nowrap",
          }}
        >
          {getToolDisplayName(op)}
        </Text>
        {index < operations.length - 1 && (
          <Text component="span" size="sm" mx={4}>
            →
          </Text>
        )}
      </React.Fragment>
    ));

    return (
      <div style={{ maxWidth: 360, width: "auto" }}>
        {description && (
          <Text
            size="sm"
            mb={8}
            style={{ whiteSpace: "normal", wordWrap: "break-word" }}
          >
            {description}
          </Text>
        )}
        {operations.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "4px",
            }}
          >
            {toolChain}
          </div>
        )}
      </div>
    );
  };

  const buttonContent = (
    <>
      {badgeIcon && (
        <ToolIcon
          icon={<Icon name={badgeIcon} />}
          {...(keepIconColor && {
            color: "var(--c-accent-fg, var(--c-primary))",
          })}
        />
      )}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          flex: 1,
          overflow: "visible",
        }}
      >
        {title ? (
          // Custom automation with title
          <Text size="sm" truncate style={{ textAlign: "left" }}>
            {title}
          </Text>
        ) : (
          // Suggested automation showing tool chain
          <Group gap="xs" justify="flex-start" style={{ flex: 1 }}>
            {operations.map((op, index) => (
              <React.Fragment key={`${op}-${index}`}>
                <Text size="sm">{getToolDisplayName(op)}</Text>
                {index < operations.length - 1 && (
                  <Text size="sm" c="dimmed">
                    →
                  </Text>
                )}
              </React.Fragment>
            ))}
          </Group>
        )}
      </div>
    </>
  );

  const wrapperContent = (
    <Box
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        paddingRight: "0.25rem",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <SharedButton
        variant="tertiary"
        onClick={onClick}
        size="sm"
        fullWidth
        justify="start"
        className="tool-button"
        style={{
          flex: 1,
          minWidth: 0,
          borderRadius: 0,
          color: "var(--c-text)",
          overflow: "visible",
          backgroundColor:
            isHovered || isMenuOpen ? "var(--c-hover)" : undefined,
        }}
      >
        {buttonContent}
      </SharedButton>
      {showMenu && (
        <Menu
          position="bottom-end"
          withinPortal
          onOpen={() => setIsMenuOpen(true)}
          onClose={() => setIsMenuOpen(false)}
        >
          <Menu.Target>
            <ActionIcon
              variant="tertiary"
              size="sm"
              aria-label={t(
                "automate.entryMenu.label",
                "Open menu for {{title}}",
                { title: title || operations.join(" → ") },
              )}
              onClick={(e) => e.stopPropagation()}
              style={{ flexShrink: 0, color: "var(--c-text-muted)" }}
            >
              <Icon name="ellipsis-vertical" size={18} />
            </ActionIcon>
          </Menu.Target>

          <Menu.Dropdown>
            {onImport && (
              <Menu.Item
                leftSection={<Icon name="file-up" size={16} />}
                onClick={(e) => {
                  e.stopPropagation();
                  onImport();
                }}
              >
                {t("automate.import", "Import")}
              </Menu.Item>
            )}
            {onCopy && (
              <Menu.Item
                leftSection={<Icon name="copy" size={16} />}
                onClick={(e) => {
                  e.stopPropagation();
                  onCopy();
                }}
              >
                {t("automate.copyToSaved", "Copy to Saved")}
              </Menu.Item>
            )}
            {onEdit && (
              <Menu.Item
                leftSection={<Icon name="pencil" size={16} />}
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                {t("edit", "Edit")}
              </Menu.Item>
            )}
            {onExportAutomation && (
              <Menu.Item
                leftSection={<Icon name="download" size={16} />}
                onClick={(e) => {
                  e.stopPropagation();
                  onExportAutomation();
                }}
              >
                {t("automate.export", "Export")}
              </Menu.Item>
            )}
            {onExportFolderScan && (
              <Menu.Item
                leftSection={<Icon name="folder-input" size={16} />}
                onClick={(e) => {
                  e.stopPropagation();
                  onExportFolderScan();
                }}
              >
                {t(
                  "automate.exportForFolderScanning",
                  "Export for Folder Scanning",
                )}
              </Menu.Item>
            )}
            {onDelete && (
              <Menu.Item
                leftSection={<Icon name="trash" size={16} />}
                style={{ color: "var(--c-danger)" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                {t("delete", "Delete")}
              </Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
      )}
    </Box>
  );

  // Show tooltip if there's a description OR operations to display
  const shouldShowTooltip = description || operations.length > 0;

  return shouldShowTooltip ? (
    <Tooltip
      content={createTooltipContent()}
      position="left"
      maxWidth={360}
      arrow={true}
      delay={500}
    >
      {wrapperContent}
    </Tooltip>
  ) : (
    wrapperContent
  );
}
