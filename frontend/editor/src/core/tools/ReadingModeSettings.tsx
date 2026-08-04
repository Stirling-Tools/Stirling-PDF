import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, Select, Button, Group, Text, Box, ColorPicker, ActionIcon, Tooltip } from '@mantine/core';
import { IconEye, IconEyeOff, IconPalette, IconInvert } from '@tabler/icons-react';
import { useToolWorkflow } from '../../contexts/ToolWorkflowContext';
import { usePreferences } from '../../contexts/PreferencesContext';
import { readingModeFilters, ReadingMode } from '../../constants/theme';

export const ReadingModeSettings: React.FC = () => {
  const { t } = useTranslation();
  const { preferences, updatePreferences } = usePreferences();
  const [showColorPicker, setShowColorPicker] = useState(false);

  const readingMode = (preferences.readingMode as ReadingMode) || 'normal';
  const backgroundColor = preferences.customBackgroundColor || '#ffffff';

  const handleReadingModeChange = useCallback((value: string | null) => {
    if (value) {
      updatePreferences({ readingMode: value as ReadingMode });
    }
  }, [updatePreferences]);

  const handleBackgroundColorChange = useCallback((color: string) => {
    updatePreferences({ customBackgroundColor: color });
  }, [updatePreferences]);

  const toggleColorPicker = useCallback(() => {
    setShowColorPicker(prev => !prev);
  }, []);

  return (
    <Stack gap="md">
      <Box>
        <Text size="sm" fw={500} mb="xs">
          {t('workspace.readingMode')}
        </Text>
        <Select
          value={readingMode}
          onChange={handleReadingModeChange}
          data={[
            { value: 'normal', label: t('workspace.readingModeNormal') },
            { value: 'sepia', label: t('workspace.readingModeSepia') },
            { value: 'invert', label: t('workspace.readingModeInvert') },
          ]}
          allowDeselect={false}
        />
      </Box>

      <Group wrap="nowrap" align="flex-start">
        <Button
          variant={showColorPicker ? 'filled' : 'outline'}
          onClick={toggleColorPicker}
          leftSection={<IconPalette size={16} />}
          size="sm"
        >
          {t('workspace.customBackground')}
        </Button>

        {backgroundColor && (
          <Tooltip label={backgroundColor}>
            <Box
              style={{
                width: 24,
                height: 24,
                borderRadius: 4,
                backgroundColor,
                border: '1px solid var(--mantine-color-gray-3)',
              }}
            />
          </Tooltip>
        )}
      </Group>

      {showColorPicker && (
        <Box>
          <ColorPicker
            format="hex"
            value={backgroundColor}
            onChange={handleBackgroundColorChange}
            withPicker={true}
          />
        </Box>
      )}

      <Box mt="md">
        <Text size="xs" c="dimmed">
          {t('workspace.readingModeHint')}
        </Text>
      </Box>
    </Stack>
  );
};
