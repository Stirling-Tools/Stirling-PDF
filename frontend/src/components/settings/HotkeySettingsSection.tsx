import { Alert, Button, Group, Stack, Table, Text } from '@mantine/core';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useToolWorkflow } from '../../contexts/ToolWorkflowContext';
import { useHotkeys } from '../../contexts/HotkeyContext';
import ShortcutDisplay from '../hotkeys/ShortcutDisplay';
import { captureShortcut } from '../../utils/hotkeys';

interface HotkeySettingsSectionProps {
  isOpen: boolean;
}

const headerStyle: React.CSSProperties = { fontWeight: 600 };

export function HotkeySettingsSection({ isOpen }: HotkeySettingsSectionProps) {
  const { toolRegistry } = useToolWorkflow();
  const {
    getShortcutForTool,
    updateHotkey,
    resetHotkey,
    resetAllHotkeys,
    customHotkeys,
    isShortcutAvailable,
    setCaptureActive,
    platform,
  } = useHotkeys();

  const [editingTool, setEditingTool] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const tools = useMemo(
    () => Object.entries(toolRegistry || {}),
    [toolRegistry]
  );

  const stopEditing = useCallback(() => {
    setEditingTool(null);
    setCaptureActive(false);
    setErrorMessage(null);
  }, [setCaptureActive]);

  const startEditing = useCallback((toolId: string) => {
    setCaptureActive(true);
    setEditingTool(toolId);
    setErrorMessage(null);
  }, [setCaptureActive]);

  useEffect(() => {
    if (!isOpen && editingTool) {
      stopEditing();
    }
  }, [isOpen, editingTool, stopEditing]);

  useEffect(() => {
    return () => {
      setCaptureActive(false);
    };
  }, [setCaptureActive]);

  useEffect(() => {
    if (!editingTool) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        stopEditing();
        return;
      }

      const result = captureShortcut(event);
      if (!result.keyToken) {
        setErrorMessage('Press a supported key.');
        return;
      }

      if (result.modifiers.length === 0) {
        setErrorMessage('Include at least one modifier key.');
        return;
      }

      if (!result.shortcut) {
        setErrorMessage('Press a supported key combination.');
        return;
      }

      if (!isShortcutAvailable(result.shortcut, editingTool)) {
        setErrorMessage('That shortcut is already assigned.');
        return;
      }

      updateHotkey(editingTool, result.shortcut);
      stopEditing();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [editingTool, isShortcutAvailable, stopEditing, updateHotkey]);

  const renderShortcutCell = (toolId: string) => {
    const shortcut = getShortcutForTool(toolId);

    if (editingTool === toolId) {
      return (
        <Stack gap={4} align="flex-start">
          <Text size="sm" c="blue">
            Press the new shortcut (Esc to cancel)
          </Text>
          {errorMessage && (
            <Text size="xs" c="red">
              {errorMessage}
            </Text>
          )}
        </Stack>
      );
    }

    if (!shortcut) {
      return <Text size="sm" c="dimmed">Not assigned</Text>;
    }

    return <ShortcutDisplay shortcut={shortcut} />;
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Text size="lg" fw={600} mb={4}>
            Keyboard Shortcuts
          </Text>
          <Text size="sm" c="dimmed">
            Click change to set a custom shortcut. Use modifiers like {platform === 'mac' ? '⌘' : 'Ctrl'} + {platform === 'mac' ? '⌥' : 'Alt'} + Shift to avoid conflicts.
          </Text>
        </div>
        <Button
          variant="light"
          size="xs"
          onClick={() => {
            resetAllHotkeys();
            stopEditing();
          }}
        >
          Restore defaults
        </Button>
      </Group>

      <Table striped highlightOnHover withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={headerStyle}>Tool</Table.Th>
            <Table.Th style={headerStyle}>Shortcut</Table.Th>
            <Table.Th style={headerStyle}>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {tools.map(([toolId, tool]) => {
            const isEditing = editingTool === toolId;
            const hasCustom = toolId in customHotkeys;

            return (
              <Table.Tr key={toolId}>
                <Table.Td>
                  <Stack gap={2}>
                    <Text fw={500}>{tool.name}</Text>
                    <Text size="xs" c="dimmed">
                      {tool.description}
                    </Text>
                  </Stack>
                </Table.Td>
                <Table.Td>{renderShortcutCell(toolId)}</Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    {isEditing ? (
                      <Button size="xs" variant="light" color="gray" onClick={stopEditing}>
                        Cancel
                      </Button>
                    ) : (
                      <Button size="xs" variant="light" onClick={() => startEditing(toolId)}>
                        Change
                      </Button>
                    )}
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      onClick={() => {
                        resetHotkey(toolId);
                        if (isEditing) {
                          stopEditing();
                        }
                      }}
                      disabled={!hasCustom}
                    >
                      Reset
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>

      {tools.length === 0 && (
        <Text size="sm" c="dimmed">
          No tools available for configuration.
        </Text>
      )}

      {editingTool && (
        <Alert color="blue" title="Recording shortcut" variant="light">
          Press the new key combination now. Use Escape to cancel.
        </Alert>
      )}
    </Stack>
  );
}

export default HotkeySettingsSection;
