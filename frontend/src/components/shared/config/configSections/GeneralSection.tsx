import React, { useState, useEffect } from 'react';
import { Paper, Stack, Switch, Text, Tooltip, NumberInput, SegmentedControl } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '../../../../contexts/PreferencesContext';
import { ToolPanelMode } from 'src/contexts/toolWorkflow/toolWorkflowState';

const DEFAULT_AUTO_UNZIP_FILE_LIMIT = 4;

const GeneralSection: React.FC = () => {
  const { t } = useTranslation();
  const { preferences, updatePreference } = usePreferences();
  const [fileLimitInput, setFileLimitInput] = useState<number | string>(preferences.autoUnzipFileLimit);

  // Sync local state with preference changes
  useEffect(() => {
    setFileLimitInput(preferences.autoUnzipFileLimit);
  }, [preferences.autoUnzipFileLimit]);

  return (
    <Stack gap="lg">
      <div>
        <Text fw={600} size="lg">{t('settings.general.title', 'General')}</Text>
        <Text size="sm" c="dimmed">
          {t('settings.general.description', 'Configure general application preferences.')}
        </Text>
      </div>

      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">
                {t('settings.general.defaultToolPickerMode', 'Default tool picker mode')}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('settings.general.defaultToolPickerModeDescription', 'Choose whether the tool picker opens in fullscreen or sidebar by default')}
              </Text>
            </div>
            <SegmentedControl
              value={preferences.defaultToolPanelMode}
              onChange={(val: string) => updatePreference('defaultToolPanelMode', val as ToolPanelMode)}
              data={[
                { label: t('settings.general.mode.sidebar', 'Sidebar'), value: 'sidebar' },
                { label: t('settings.general.mode.fullscreen', 'Fullscreen'), value: 'fullscreen' },
              ]}
            />
          </div>
          <Tooltip
            label={t('settings.general.autoUnzipTooltip', 'Automatically extract ZIP files returned from API operations. Disable to keep ZIP files intact. This does not affect automation workflows.')}
            multiline
            w={300}
            withArrow
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'help' }}>
              <div>
                <Text fw={500} size="sm">
                  {t('settings.general.autoUnzip', 'Auto-unzip API responses')}
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  {t('settings.general.autoUnzipDescription', 'Automatically extract files from ZIP responses')}
                </Text>
              </div>
              <Switch
                checked={preferences.autoUnzip}
                onChange={(event) => updatePreference('autoUnzip', event.currentTarget.checked)}
              />
            </div>
          </Tooltip>

          <Tooltip
            label={t('settings.general.autoUnzipFileLimitTooltip', 'Only unzip if the ZIP contains this many files or fewer. Set higher to extract larger ZIPs.')}
            multiline
            w={300}
            withArrow
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'help' }}>
              <div>
                <Text fw={500} size="sm">
                  {t('settings.general.autoUnzipFileLimit', 'Auto-unzip file limit')}
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  {t('settings.general.autoUnzipFileLimitDescription', 'Maximum number of files to extract from ZIP')}
                </Text>
              </div>
              <NumberInput
                value={fileLimitInput}
                onChange={setFileLimitInput}
                onBlur={() => {
                  const numValue = Number(fileLimitInput);
                  const finalValue = (!fileLimitInput || isNaN(numValue) || numValue < 1 || numValue > 100) ? DEFAULT_AUTO_UNZIP_FILE_LIMIT : numValue;
                  setFileLimitInput(finalValue);
                  updatePreference('autoUnzipFileLimit', finalValue);
                }}
                min={1}
                max={100}
                step={1}
                disabled={!preferences.autoUnzip}
                style={{ width: 90 }}
              />
            </div>
          </Tooltip>
        </Stack>
      </Paper>
    </Stack>
  );
};

export default GeneralSection;
