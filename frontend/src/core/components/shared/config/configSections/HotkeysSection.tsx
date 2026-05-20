import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useHotkeys, HotkeyKey } from "@app/contexts/HotkeyContext";
import { ToolId, isValidToolId } from "@app/types/toolId";
import HotkeyDisplay from "@app/components/hotkeys/HotkeyDisplay";
import {
  bindingEquals,
  eventToBinding,
  HotkeyBinding,
} from "@app/utils/hotkeys";
import { ToolRegistryEntry } from "@app/data/toolsTaxonomy";
import { HOTKEY_ACTIONS, isHotkeyActionId } from "@app/data/hotkeyActions";

const rowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
};

const rowHeaderStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
};

interface HotkeyRowDescriptor {
  key: HotkeyKey;
  name: string;
  description?: string;
}

const HotkeysSection: React.FC = () => {
  const { t } = useTranslation();
  const { toolRegistry } = useToolWorkflow();
  const {
    hotkeys,
    defaults,
    updateHotkey,
    resetHotkey,
    pauseHotkeys,
    resumeHotkeys,
    getDisplayParts,
    isMac,
  } = useHotkeys();
  const [editingKey, setEditingKey] = useState<HotkeyKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const tools = useMemo(
    () => Object.entries(toolRegistry) as [ToolId, ToolRegistryEntry][],
    [toolRegistry],
  );

  const actionDescriptors: HotkeyRowDescriptor[] = useMemo(
    () =>
      Object.values(HOTKEY_ACTIONS).map((action) => ({
        key: action.id,
        name: t(action.nameKey, action.fallbackName),
        description: t(action.descriptionKey, action.fallbackDescription),
      })),
    [t],
  );

  const filteredTools = useMemo(() => {
    if (!searchQuery.trim()) return tools;
    const query = searchQuery.toLowerCase();
    return tools.filter(
      ([toolId, tool]) =>
        tool.name.toLowerCase().includes(query) ||
        tool.description.toLowerCase().includes(query) ||
        toolId.toLowerCase().includes(query),
    );
  }, [tools, searchQuery]);

  const filteredActions = useMemo(() => {
    if (!searchQuery.trim()) return actionDescriptors;
    const query = searchQuery.toLowerCase();
    return actionDescriptors.filter(
      (action) =>
        action.name.toLowerCase().includes(query) ||
        action.description?.toLowerCase().includes(query) ||
        action.key.toLowerCase().includes(query),
    );
  }, [actionDescriptors, searchQuery]);

  useEffect(() => {
    if (!editingKey) {
      return;
    }
    pauseHotkeys();
    return () => {
      resumeHotkeys();
    };
  }, [editingKey, pauseHotkeys, resumeHotkeys]);

  useEffect(() => {
    if (!editingKey) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setEditingKey(null);
        setError(null);
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const binding = eventToBinding(event as KeyboardEvent);
      if (!binding) {
        const osKey = isMac ? "mac" : "windows";
        setError(t(`settings.hotkeys.errorModifier.${osKey}`));
        return;
      }

      const conflictEntry = (
        Object.entries(hotkeys) as [HotkeyKey, HotkeyBinding][]
      ).find(
        ([key, existing]) =>
          key !== editingKey && bindingEquals(existing, binding),
      );

      if (conflictEntry) {
        const conflictKey = conflictEntry[0];
        let conflictLabel: string = conflictKey;
        if (isHotkeyActionId(conflictKey)) {
          const action = HOTKEY_ACTIONS[conflictKey];
          conflictLabel = t(action.nameKey, action.fallbackName);
        } else if (
          isValidToolId(conflictKey) &&
          toolRegistry[conflictKey]?.name
        ) {
          conflictLabel = toolRegistry[conflictKey].name;
        }
        setError(
          t(
            "settings.hotkeys.errorConflict",
            "Shortcut already used by {{tool}}.",
            { tool: conflictLabel },
          ),
        );
        return;
      }

      updateHotkey(editingKey, binding);
      setEditingKey(null);
      setError(null);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [editingKey, hotkeys, toolRegistry, updateHotkey, t, isMac]);

  const handleStartCapture = (key: HotkeyKey) => {
    setEditingKey(key);
    setError(null);
  };

  const renderRow = (
    descriptor: HotkeyRowDescriptor,
    isLast: boolean,
  ): React.ReactNode => {
    const { key, name } = descriptor;
    const currentBinding = hotkeys[key];
    const defaultBinding = defaults[key];
    const isEditing = editingKey === key;
    const defaultParts = getDisplayParts(defaultBinding);
    const defaultLabel =
      defaultParts.length > 0
        ? defaultParts.join(" + ")
        : t("settings.hotkeys.none", "Not assigned");
    const hasCustom =
      Boolean(currentBinding) && !bindingEquals(currentBinding, defaultBinding);
    const resetDisabled = bindingEquals(currentBinding, defaultBinding);

    return (
      <React.Fragment key={key}>
        <Box style={rowStyle} data-testid={`hotkey-row-${key}`}>
          <div style={rowHeaderStyle}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.25rem",
                minWidth: 0,
              }}
            >
              <Text fw={600}>{name}</Text>
              <Group gap="xs" wrap="wrap" align="center">
                <HotkeyDisplay binding={currentBinding} size="md" />
                {hasCustom && (
                  <Badge variant="light" color="orange" radius="sm">
                    {t("settings.hotkeys.customBadge", "Custom")}
                  </Badge>
                )}
                <Text size="xs" c="dimmed">
                  {t("settings.hotkeys.defaultLabel", "Default: {{shortcut}}", {
                    shortcut: defaultLabel,
                  })}
                </Text>
              </Group>
            </div>

            <Group gap="xs">
              <Button
                size="xs"
                variant={isEditing ? "filled" : "default"}
                color={isEditing ? "blue" : undefined}
                onClick={() => handleStartCapture(key)}
              >
                {isEditing
                  ? t(
                      "settings.hotkeys.capturing",
                      "Press keys… (Esc to cancel)",
                    )
                  : t("settings.hotkeys.change", "Change shortcut")}
              </Button>
              <Button
                size="xs"
                variant="subtle"
                disabled={resetDisabled}
                onClick={() => resetHotkey(key)}
              >
                {t("settings.hotkeys.reset", "Reset")}
              </Button>
            </Group>
          </div>

          {isEditing && error && (
            <Alert color="red" radius="sm" variant="filled">
              {error}
            </Alert>
          )}
        </Box>

        {!isLast && <Divider />}
      </React.Fragment>
    );
  };

  return (
    <Stack gap="lg">
      <div>
        <Text fw={600} size="lg">
          {t("settings.hotkeys.title", "Keyboard Shortcuts")}
        </Text>
        <Text size="sm" c="dimmed">
          {t(
            "settings.hotkeys.description",
            'Customize keyboard shortcuts for quick tool access. Click "Change shortcut" and press a new key combination. Press Esc to cancel.',
          )}
        </Text>
      </div>

      <TextInput
        placeholder={t("settings.hotkeys.searchPlaceholder", "Search tools...")}
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.currentTarget.value)}
        size="md"
        radius="md"
      />

      {filteredActions.length > 0 && (
        <div>
          <Text fw={600} size="md" mb="xs">
            {t("settings.hotkeys.navigationTitle", "Navigation")}
          </Text>
          <Paper withBorder p="md" radius="md">
            <Stack gap="md">
              {filteredActions.map((descriptor, index) =>
                renderRow(descriptor, index === filteredActions.length - 1),
              )}
            </Stack>
          </Paper>
        </div>
      )}

      <div>
        <Text fw={600} size="md" mb="xs">
          {t("settings.hotkeys.toolShortcutsTitle", "Tool Shortcuts")}
        </Text>
        <Paper withBorder p="md" radius="md">
          <Stack gap="md">
            {filteredTools.length === 0 ? (
              <Text c="dimmed" ta="center" py="xl">
                {t("toolPicker.noToolsFound", "No tools found")}
              </Text>
            ) : (
              filteredTools.map(([toolId, tool], index) =>
                renderRow(
                  {
                    key: toolId,
                    name: tool.name,
                    description: tool.description,
                  },
                  index === filteredTools.length - 1,
                ),
              )
            )}
          </Stack>
        </Paper>
      </div>
    </Stack>
  );
};

export default HotkeysSection;
