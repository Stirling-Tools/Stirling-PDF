import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Group, Text, ActionIcon, Menu, Box } from '@mantine/core';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { Tooltip } from '../../shared/Tooltip';

interface AutomationEntryProps {
  /** Optional title for the automation (usually for custom ones) */
  title?: string;
  /** Optional description for tooltip */
  description?: string;
  /** MUI Icon component for the badge */
  badgeIcon?: React.ComponentType<any>;
  /** Array of tool operation names in the workflow OR full operation objects with display names */
  operations: string[] | Array<{operation: string; displayName?: string}>;
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
  onCopy
}: AutomationEntryProps) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Keep item in hovered state if menu is open
  const shouldShowHovered = isHovered || isMenuOpen;

  // Create tooltip content with description and tool chain
  const createTooltipContent = () => {
    if (!description) return null;

    const toolChain = operations.map((op, index) => {
      // Handle both string[] and operation object arrays
      const operationName = typeof op === 'string' ? op : op.operation;
      const displayName = typeof op === 'object' && op.displayName ? op.displayName : t(`${operationName}.title`, operationName);
      
      return (
        <React.Fragment key={`${operationName}-${index}`}>
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
            {displayName}
          </Text>
          {index < operations.length - 1 && (
            <Text component="span" size="sm" mx={4}>
              →
            </Text>
          )}
        </React.Fragment>
      );
    });

    return (
      <div style={{ minWidth: '400px', width: 'auto' }}>
        <Text size="sm" mb={8} style={{ whiteSpace: 'normal', wordWrap: 'break-word' }}>
          {description}
        </Text>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
          {toolChain}
        </div>
      </div>
    );
  };

  const renderContent = () => {
    if (title) {
      // Custom automation with title
      return (
        <Group gap="md" align="center" justify="flex-start" style={{ width: '100%' }}>
          {BadgeIcon && (
            <BadgeIcon
              style={{
                color: keepIconColor ? 'var(--mantine-primary-color-filled)' : 'var(--mantine-color-text)'
              }}
            />
          )}
          <Text size="xs" style={{ flex: 1, textAlign: 'left', color: 'var(--mantine-color-text)' }}>
            {title}
          </Text>
        </Group>
      );
    } else {
      // Suggested automation showing tool chain
      return (
        <Group gap="md" align="center" justify="flex-start" style={{ width: '100%' }}>
          {BadgeIcon && (
            <BadgeIcon
              style={{
                color: keepIconColor ? 'var(--mantine-primary-color-filled)' : 'var(--mantine-color-text)'
              }}
            />
          )}
          <Group gap="xs" justify="flex-start" style={{ flex: 1 }}>
            {operations.map((op, index) => {
              // Handle both string[] and operation object arrays  
              const operationName = typeof op === 'string' ? op : op.operation;
              const displayName = typeof op === 'object' && op.displayName ? op.displayName : t(`${operationName}.title`, operationName);
              
              return (
                <React.Fragment key={`${operationName}-${index}`}>
                  <Text size="xs" style={{ color: 'var(--mantine-color-text)' }}>
                    {displayName}
                  </Text>

                  {index < operations.length - 1 && (
                    <Text size="xs" c="dimmed" style={{ color: 'var(--mantine-color-text)' }}>
                      →
                    </Text>
                  )}
                </React.Fragment>
              );
            })}
          </Group>
        </Group>
      );
    }
  };

  const boxContent = (
    <Box
      style={{
        backgroundColor: shouldShowHovered ? 'var(--mantine-color-gray-1)' : 'transparent',
        borderRadius: 'var(--mantine-radius-md)',
        transition: 'background-color 0.15s ease',
        padding: '0.75rem 1rem',
        cursor: 'pointer'
      }}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Group gap="md" align="center" justify="space-between" style={{ width: '100%' }}>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start' }}>
          {renderContent()}
        </div>

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
                  opacity: shouldShowHovered ? 1 : 0,
                  transform: shouldShowHovered ? 'scale(1)' : 'scale(0.8)',
                  transition: 'opacity 0.3s ease, transform 0.3s ease',
                  pointerEvents: shouldShowHovered ? 'auto' : 'none'
                }}
              >
                <MoreVertIcon style={{ fontSize: 20 }} />
              </ActionIcon>
            </Menu.Target>

            <Menu.Dropdown>
              {onCopy && (
                <Menu.Item
                  leftSection={<ContentCopyIcon style={{ fontSize: 16 }} />}
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
                  leftSection={<EditIcon style={{ fontSize: 16 }} />}
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
                  leftSection={<DeleteIcon style={{ fontSize: 16 }} />}
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
      </Group>
    </Box>
  );

  // Only show tooltip if description exists, otherwise return plain content
  return description ? (
    <Tooltip 
      content={createTooltipContent()} 
      position="right" 
      arrow={true} 
      delay={500}
    >
      {boxContent}
    </Tooltip>
  ) : (
    boxContent
  );
}
