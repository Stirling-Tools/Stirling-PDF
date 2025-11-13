import React, { useState, useEffect } from 'react';
import { Paper, Text, Button, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { defaultAppService } from '@app/services/defaultAppService';
import { alert } from '@app/components/toast';

export const DefaultAppSettings: React.FC = () => {
  const { t } = useTranslation();
  const [isDefault, setIsDefault] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    checkDefaultStatus();
  }, []);

  const checkDefaultStatus = async () => {
    try {
      const status = await defaultAppService.isDefaultPdfHandler();
      setIsDefault(status);
    } catch (error) {
      console.error('Failed to check default status:', error);
    }
  };

  const handleSetDefault = async () => {
    setIsLoading(true);
    try {
      const result = await defaultAppService.setAsDefaultPdfHandler();

      if (result === 'set_successfully') {
        alert({
          alertType: 'success',
          title: t('defaultApp.success.title', 'Default App Set'),
          body: t('defaultApp.success.message', 'Stirling PDF is now your default PDF editor'),
        });
        setIsDefault(true);
      } else if (result === 'opened_settings') {
        alert({
          alertType: 'neutral',
          title: t('defaultApp.settingsOpened.title', 'Settings Opened'),
          body: t('defaultApp.settingsOpened.message', 'Please select Stirling PDF in your system settings'),
        });
      }
    } catch (error) {
      console.error('Failed to set default:', error);
      alert({
        alertType: 'error',
        title: t('defaultApp.error.title', 'Error'),
        body: t('defaultApp.error.message', 'Failed to set default PDF handler'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" align="center">
        <div>
          <Text fw={500} size="sm">
            {t('settings.general.defaultPdfEditor', 'Default PDF editor')}
          </Text>
          <Text size="xs" c="dimmed" mt={4}>
            {isDefault === true
              ? t('settings.general.defaultPdfEditorActive', 'Stirling PDF is your default PDF editor')
              : isDefault === false
              ? t('settings.general.defaultPdfEditorInactive', 'Another application is set as default')
              : t('settings.general.defaultPdfEditorChecking', 'Checking...')}
          </Text>
        </div>
        <Button
          variant={isDefault ? 'light' : 'filled'}
          color="blue"
          size="sm"
          onClick={handleSetDefault}
          loading={isLoading}
          disabled={isDefault === true}
        >
          {isDefault
            ? t('settings.general.defaultPdfEditorSet', 'Already Default')
            : t('settings.general.setAsDefault', 'Set as Default')}
        </Button>
      </Group>
    </Paper>
  );
};
