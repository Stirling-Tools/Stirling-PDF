import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Box, Button, Divider, Group, Paper, Stack, Text, TextInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useToolWorkflow } from '../../../../contexts/ToolWorkflowContext';
import { useHotkeys } from '../../../../contexts/HotkeyContext';
import HotkeyDisplay from '../../../hotkeys/HotkeyDisplay';
import { bindingEquals, eventToBinding } from '../../../../utils/hotkeys';

const rowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
};

const rowHeaderStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.5rem',
};

const HotkeysSection: React.FC = () => {
  const { t } = useTranslation();
  const { toolRegistry } = useToolWorkflow();
  const { hotkeys, defaults, updateHotkey, resetHotkey, pauseHotkeys, resumeHotkeys, getDisplayParts, isMac } = useHotkeys();
  const [editingTool, setEditingTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const tools = useMemo(() => Object.entries(toolRegistry), [toolRegistry]);

  const filteredTools = useMemo(() => {
    if (!searchQuery.trim()) return tools;
    
    const query = searchQuery.toLowerCase();
    return tools.filter(([toolId, tool]) => 
      tool.name.toLowerCase().includes(query) ||
      tool.description.toLowerCase().includes(query) ||
      toolId.toLowerCase().includes(query)
    );
  }, [tools, searchQuery]);

  useEffect(() => {
    if (!editingTool) {
      return;
    }
    pauseHotkeys();
    return () => {
      resumeHotkeys();
    };
  }, [editingTool, pauseHotkeys, resumeHotkeys]);

  useEffect(() => {
    if (!editingTool) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setEditingTool(null);
        setError(null);
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const binding = eventToBinding(event as KeyboardEvent);
      if (!binding) {
        const osKey = isMac ? 'mac' : 'windows';
        const fallbackText = isMac
          ? 'Include ⌘ (Command), ⌥ (Option), or another modifier in your shortcut.'
          : 'Include Ctrl, Alt, or another modifier in your shortcut.';
        setError(t(`settings.hotkeys.errorModifier.${osKey}`, fallbackText));
        return;
      }

      const conflictEntry = Object.entries(hotkeys).find(([toolId, existing]) => (
        toolId !== editingTool && bindingEquals(existing, binding)
      ));

      if (conflictEntry) {
        const conflictTool = toolRegistry[conflictEntry[0]]?.name ?? conflictEntry[0];
        setError(t('settings.hotkeys.errorConflict', 'Shortcut already used by {{tool}}.', { tool: conflictTool }));
        return;
      }

      updateHotkey(editingTool, binding);
      setEditingTool(null);
      setError(null);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [editingTool, hotkeys, toolRegistry, updateHotkey, t]);

  const handleStartCapture = (toolId: string) => {
    setEditingTool(toolId);
    setError(null);
  };

  return (
    <Stack gap="lg">
      <div>
        <Text fw={600} size="lg">Keyboard Shortcuts</Text>
        <Text size="sm" c="dimmed">
          Customize keyboard shortcuts for quick tool access. Click "Change shortcut" and press a new key combination. Press Esc to cancel.
        </Text>
      </div>

      <TextInput
        placeholder="Search tools..."
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.currentTarget.value)}
        size="md"
        radius="md"
      />

      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          {filteredTools.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">
              {searchQuery.trim() ? 'No tools found matching your search.' : 'No tools available.'}
            </Text>
          ) : (
            filteredTools.map(([toolId, tool], index) => {
            const currentBinding = hotkeys[toolId];
            const defaultBinding = defaults[toolId];
            const isEditing = editingTool === toolId;
            const defaultParts = getDisplayParts(defaultBinding);
            const defaultLabel = defaultParts.length > 0
              ? defaultParts.join(' + ')
              : t('settings.hotkeys.none', 'Not assigned');

            return (
              <React.Fragment key={toolId}>
                <Box style={rowStyle} data-testid={`hotkey-row-${toolId}`}>
                  <div style={rowHeaderStyle}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                      <Text fw={600}>{tool.name}</Text>
                      <Group gap="xs" wrap="wrap" align="center">
                        <HotkeyDisplay binding={currentBinding} size="md" />
                        {!bindingEquals(currentBinding, defaultBinding) && (
                          <Badge variant="light" color="orange" radius="sm">
                            {t('settings.hotkeys.customBadge', 'Custom')}
                          </Badge>
                        )}
                        <Text size="xs" c="dimmed">
                          {t('settings.hotkeys.defaultLabel', 'Default: {{shortcut}}', { shortcut: defaultLabel })}
                        </Text>
                      </Group>
                    </div>

                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant={isEditing ? 'filled' : 'default'}
                        color={isEditing ? 'blue' : undefined}
                        onClick={() => handleStartCapture(toolId)}
                      >
                        {isEditing
                          ? t('settings.hotkeys.capturing', 'Press keys… (Esc to cancel)')
                          : t('settings.hotkeys.change', 'Change shortcut')}
                      </Button>
                      <Button
                        size="xs"
                        variant="subtle"
                        disabled={bindingEquals(currentBinding, defaultBinding)}
                        onClick={() => resetHotkey(toolId)}
                      >
                        {t('settings.hotkeys.reset', 'Reset')}
                      </Button>
                    </Group>
                  </div>

                  {isEditing && error && (
                    <Alert color="red" radius="sm" variant="filled">
                      {error}
                    </Alert>
                  )}
                </Box>

                {index < filteredTools.length - 1 && <Divider />}
              </React.Fragment>
            );
          })
          )}
        </Stack>
      </Paper>
    </Stack>
  );
};

export default HotkeysSection;