import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Group, ScrollArea, Stack, Table, Text } from '@mantine/core';
import { useHotkeysContext, Hotkey } from '../../../contexts/HotkeysContext';
import { useToolWorkflow } from '../../../contexts/ToolWorkflowContext';

const areHotkeysEqual = (a?: Hotkey, b?: Hotkey): boolean => {
  if (!a || !b) return false;
  return (
    a.code === b.code &&
    a.altKey === b.altKey &&
    a.ctrlKey === b.ctrlKey &&
    a.metaKey === b.metaKey &&
    a.shiftKey === b.shiftKey
  );
};

const HotkeySettings: React.FC = () => {
  const {
    hotkeys,
    defaultHotkeys,
    formatHotkeyParts,
    setHotkey,
    resetHotkey,
    resetAllHotkeys,
    isHotkeyInUse,
    suspendHotkeys,
    createHotkeyFromEvent,
  } = useHotkeysContext();

  const { toolRegistry } = useToolWorkflow();
  const [editingToolId, setEditingToolId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sortedTools = useMemo(
    () => Object.entries(toolRegistry || {})
      .sort((a, b) => a[1].name.localeCompare(b[1].name, undefined, { sensitivity: 'base' })),
    [toolRegistry]
  );

  const toolNameMap = useMemo(() => Object.fromEntries(sortedTools), [sortedTools]);

  const stopEditing = useCallback(() => {
    setEditingToolId(null);
    setErrorMessage(null);
  }, []);

  useEffect(() => {
    if (!editingToolId) return;

    suspendHotkeys(true);

    const handleKeydown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        stopEditing();
        return;
      }

      const nextHotkey = createHotkeyFromEvent(event);

      if (!nextHotkey.altKey && !nextHotkey.ctrlKey && !nextHotkey.metaKey) {
        setErrorMessage('Please include at least one modifier key (Ctrl, Command, Alt, etc.).');
        return;
      }

      if (isHotkeyInUse(nextHotkey, editingToolId)) {
        setErrorMessage('That shortcut is already assigned to another tool.');
        return;
      }

      setHotkey(editingToolId, nextHotkey);
      setEditingToolId(null);
      setErrorMessage(null);
    };

    window.addEventListener('keydown', handleKeydown, true);

    return () => {
      suspendHotkeys(false);
      window.removeEventListener('keydown', handleKeydown, true);
    };
  }, [editingToolId, suspendHotkeys, createHotkeyFromEvent, isHotkeyInUse, setHotkey, stopEditing]);

  const renderHotkeyBadges = useCallback((hotkey: Hotkey | undefined, keyPrefix: string) => {
    const parts = formatHotkeyParts(hotkey);
    if (parts.length === 0) {
      return <Text size="sm" c="dimmed">Not assigned</Text>;
    }

    return (
      <Group gap={4} wrap="wrap">
        {parts.map((part, index) => (
          <Badge key={`${keyPrefix}-${part}-${index}`} variant="light" color="gray" radius="sm">
            {part}
          </Badge>
        ))}
      </Group>
    );
  }, [formatHotkeyParts]);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <div>
          <Text fw={600}>Tool hotkeys</Text>
          <Text size="sm" c="dimmed">
            Use keyboard shortcuts to launch tools instantly. Click "Change" and press a new key combination to customise.
          </Text>
        </div>
        <Button
          size="xs"
          variant="light"
          onClick={() => resetAllHotkeys()}
        >
          Reset all
        </Button>
      </Group>

      {editingToolId && (
        <Alert color="blue" title="Assign a shortcut">
          Press the desired key combination for <strong>{toolNameMap[editingToolId]?.name || editingToolId}</strong>, or press
          {' '}Escape to cancel.
        </Alert>
      )}

      {errorMessage && (
        <Alert color="red" title="Shortcut unavailable">
          {errorMessage}
        </Alert>
      )}

      <ScrollArea h={360} type="auto" offsetScrollbars>
        <Table highlightOnHover verticalSpacing="sm" striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Tool</Table.Th>
              <Table.Th>Shortcut</Table.Th>
              <Table.Th style={{ width: '14rem' }}>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sortedTools.map(([toolId, tool]) => {
              const current = hotkeys[toolId];
              const defaultHotkey = defaultHotkeys[toolId];
              const isEditing = editingToolId === toolId;

              return (
                <Table.Tr key={toolId}>
                  <Table.Td>
                    <Stack gap={2}>
                      <Text fw={500}>{tool.name}</Text>
                      {tool.description && (
                        <Text size="xs" c="dimmed" lineClamp={2}>
                          {tool.description}
                        </Text>
                      )}
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={6}>
                      {isEditing ? (
                        <Badge color="blue" variant="light">Listening...</Badge>
                      ) : (
                        renderHotkeyBadges(current, `${toolId}-current`)
                      )}
                      {defaultHotkey && !isEditing && !areHotkeysEqual(current, defaultHotkey) && (
                        <Group gap={6} wrap="wrap">
                          <Text size="xs" c="dimmed">Default:</Text>
                          {renderHotkeyBadges(defaultHotkey, `${toolId}-default`)}
                        </Group>
                      )}
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      {isEditing ? (
                        <Button size="xs" variant="subtle" onClick={stopEditing}>
                          Cancel
                        </Button>
                      ) : (
                        <Button size="xs" variant="light" onClick={() => {
                          setEditingToolId(toolId);
                          setErrorMessage(null);
                        }}>
                          Change
                        </Button>
                      )}
                      <Button
                        size="xs"
                        variant="subtle"
                        onClick={() => resetHotkey(toolId)}
                        disabled={!defaultHotkey || areHotkeysEqual(current, defaultHotkey)}
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
      </ScrollArea>
    </Stack>
  );
};

export default HotkeySettings;
