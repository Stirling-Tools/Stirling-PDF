import React from 'react';
import { Paper, Stack, Switch, Text, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '../../../../contexts/PreferencesContext';

const GeneralSection: React.FC = () => {
  const { t } = useTranslation();
  const { preferences, updatePreference } = usePreferences();

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
        </Stack>
      </Paper>
    </Stack>
  );
};

export default GeneralSection;
