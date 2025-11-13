import React, { useState, useEffect } from 'react';
import { Paper, Group, Text, Button, ActionIcon } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import LocalIcon from '@app/components/shared/LocalIcon';
import { defaultAppService } from '@app/services/defaultAppService';
import { alert } from '@app/components/toast';

const PROMPT_DISMISSED_KEY = 'stirlingpdf_default_app_prompt_dismissed';

export const DefaultAppBanner: React.FC = () => {
  const { t } = useTranslation();
  const [promptDismissed, setPromptDismissed] = useState(() => {
    return localStorage.getItem(PROMPT_DISMISSED_KEY) === 'true';
  });
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

  const handleDismissPrompt = () => {
    setPromptDismissed(true);
    localStorage.setItem(PROMPT_DISMISSED_KEY, 'true');
  };

  if (promptDismissed || isDefault !== false) {
    return null;
  }

  return (
    <Paper
      p="sm"
      radius={0}
      style={{
        background: 'var(--mantine-color-blue-0)',
        borderBottom: '1px solid var(--mantine-color-blue-2)',
        position: 'relative',
      }}
    >
      <Group gap="sm" align="center" wrap="nowrap">
        <LocalIcon icon="picture-as-pdf-rounded" width="1.2rem" height="1.2rem" style={{ color: 'var(--mantine-color-blue-6)', flexShrink: 0 }} />
        <Text fw={500} size="sm" style={{ color: 'var(--mantine-color-blue-9)' }}>
          {t('defaultApp.prompt.message', 'Make Stirling PDF your default application for opening PDF files.')}
        </Text>
        <Button
          variant="light"
          color="blue"
          size="xs"
          onClick={handleSetDefault}
          loading={isLoading}
          leftSection={<LocalIcon icon="check-circle-rounded" width="0.9rem" height="0.9rem" />}
          style={{ flexShrink: 0 }}
        >
          {t('defaultApp.setDefault', 'Set Default')}
        </Button>
      </Group>
      <ActionIcon
        variant="subtle"
        color="gray"
        size="sm"
        onClick={handleDismissPrompt}
        aria-label={t('defaultApp.dismiss', 'Dismiss')}
        style={{ position: 'absolute', top: '0.5rem', right: '0.5rem' }}
      >
        <LocalIcon icon="close-rounded" width="1rem" height="1rem" />
      </ActionIcon>
    </Paper>
  );
};
