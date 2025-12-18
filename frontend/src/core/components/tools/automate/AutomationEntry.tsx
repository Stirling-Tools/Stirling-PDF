import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Group, Text, ActionIcon, Menu, Button, Box } from '@mantine/core';
import LocalIcon from '@app/components/shared/LocalIcon';
import { Tooltip } from '@app/components/shared/Tooltip';
import { ToolIcon } from '@app/components/shared/ToolIcon';
import { ToolRegistry } from '@app/data/toolsTaxonomy';
import { ToolId } from "@app/types/toolId";

interface AutomationEntryProps {
  /** Optional title for the automation (usually for custom ones) */
  title?: string;
  /** Optional description for tooltip */
  description?: string;
  /** MUI Icon component for the badge */
  badgeIcon?: React.ComponentType<any>;
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
  /** Tool registry to resolve operation names */
  toolRegistry?: Partial<ToolRegistry>;
}

export default function AutomationEntry({
  title,
  description,
  badgeIcon: BadgeIcon,
  operations,
  onClick,
  keepIconColor = false,
  showMenu = false,
  onEdit,
  onDelete,
  onCopy,
  toolRegistry
}: AutomationEntryProps) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const shouldShowMenu = isHovered || isMenuOpen;

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
            color: 'var(--mantine-primary-color-filled)',
            background: 'var(--mantine-primary-color-light)',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '0.75rem',
            whiteSpace: 'nowrap'
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
      <div style={{ minWidth: '400px', width: 'auto' }}>
        {description && (
          <Text size="sm" mb={8} style={{ whiteSpace: 'normal', wordWrap: 'break-word' }}>
            {description}
          </Text>
        )}
        {operations.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
            {toolChain}
          </div>
        )}
      </div>
    );
  };

  const buttonContent = (
    <>
      {BadgeIcon && (
        <ToolIcon
          icon={<BadgeIcon />}
          {...(keepIconColor && { color: 'var(--mantine-primary-color-filled)' })}
        />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1, overflow: 'visible' }}>
        {title ? (
          // Custom automation with title
          <Text size="sm" style={{ textAlign: 'left' }}>
            {title}
          </Text>
        ) : (
          // Suggested automation showing tool chain
          <Group gap="xs" justify="flex-start" style={{ flex: 1 }}>
            {operations.map((op, index) => (
              <React.Fragment key={`${op}-${index}`}>
                <Text size="sm">
                  {getToolDisplayName(op)}
                </Text>
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
      style={{ position: 'relative', width: '100%' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Button
        variant="subtle"
        onClick={onClick}
        size="sm"
        radius="md"
        fullWidth
        justify="flex-start"
        className="tool-button"
        styles={{
          root: {
            borderRadius: 0,
            color: "var(--tools-text-and-icon-color)",
            overflow: 'visible',
            backgroundColor: shouldShowMenu ? 'var(--automation-entry-hover-bg)' : undefined,
            '&:hover': {
              backgroundColor: 'var(--automation-entry-hover-bg)'
            }
          },
          label: { overflow: 'visible' }
        }}
      >
        {buttonContent}
      </Button>
      {showMenu && (
        <Menu
          position="bottom-end"
          withinPortal
          onOpen={() => setIsMenuOpen(true)}
          onClose={() => setIsMenuOpen(false)}
        >
          <Menu.Target>
            <ActionIcon
              variant="subtle"
              c="dimmed"
              size="md"
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                right: '0.5rem',
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 1,
                opacity: shouldShowMenu ? 1 : 0,
                transition: 'opacity 0.2s ease',
                pointerEvents: shouldShowMenu ? 'auto' : 'none'
              }}
            >
              <LocalIcon icon="more-vert" width={20} height={20} />
            </ActionIcon>
          </Menu.Target>

          <Menu.Dropdown>
            {onCopy && (
              <Menu.Item
                leftSection={<LocalIcon icon="content-copy-rounded" width={16} height={16} />}
                onClick={(e) => {
                  e.stopPropagation();
                  onCopy();
                }}
              >
                {t('automate.copyToSaved', 'Copy to Saved')}
              </Menu.Item>
            )}
            {onEdit && (
              <Menu.Item
                leftSection={<LocalIcon icon="edit-rounded" width={16} height={16} />}
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                {t('edit', 'Edit')}
              </Menu.Item>
            )}
            {onDelete && (
              <Menu.Item
                leftSection={<LocalIcon icon="delete-rounded" width={16} height={16} />}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                {t('delete', 'Delete')}
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
      position="right"
      arrow={true}
      delay={500}
    >
      {wrapperContent}
    </Tooltip>
  ) : (
    wrapperContent
  );
}
