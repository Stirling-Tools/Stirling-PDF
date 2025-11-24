import React from 'react';
import { Alert, Stack, Text, Paper, Code, Button, Group, Loader } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { PollingStatus } from '../types/checkout';

interface SuccessStageProps {
  pollingStatus: PollingStatus;
  currentLicenseKey: string | null;
  licenseKey: string | null;
  onClose: () => void;
}

export const SuccessStage: React.FC<SuccessStageProps> = ({
  pollingStatus,
  currentLicenseKey,
  licenseKey,
  onClose,
}) => {
  const { t } = useTranslation();

  return (
    <Alert color="green" title={t('payment.success', 'Payment Successful!')}>
      <Stack gap="md">
        <Text size="sm">
          {t(
            'payment.successMessage',
            'Your subscription has been activated successfully.'
          )}
        </Text>

        {/* License Key Polling Status */}
        {pollingStatus === 'polling' && (
          <Group gap="xs">
            <Loader size="sm" />
            <Text size="sm" c="dimmed">
              {currentLicenseKey
                ? t('payment.syncingLicense', 'Syncing your upgraded license...')
                : t('payment.generatingLicense', 'Generating your license key...')}
            </Text>
          </Group>
        )}

        {pollingStatus === 'ready' && !currentLicenseKey && licenseKey && (
          <Paper withBorder p="md" radius="md" bg="gray.1">
            <Stack gap="sm">
              <Text size="sm" fw={600}>
                {t('payment.licenseKey', 'Your License Key')}
              </Text>
              <Code block>{licenseKey}</Code>
              <Button
                variant="light"
                size="sm"
                onClick={() => navigator.clipboard.writeText(licenseKey)}
              >
                {t('common.copy', 'Copy to Clipboard')}
              </Button>
              <Text size="xs" c="dimmed">
                {t(
                  'payment.licenseInstructions',
                  'This has been added to your installation. You will receive a copy in your email as well.'
                )}
              </Text>
            </Stack>
          </Paper>
        )}

        {pollingStatus === 'ready' && currentLicenseKey && (
          <Alert color="green" title={t('payment.upgradeComplete', 'Upgrade Complete')}>
            <Text size="sm">
              {t(
                'payment.upgradeCompleteMessage',
                'Your subscription has been upgraded successfully. Your existing license key has been updated.'
              )}
            </Text>
          </Alert>
        )}

        {pollingStatus === 'timeout' && (
          <Alert color="yellow" title={t('payment.licenseDelayed', 'License Key Processing')}>
            <Text size="sm">
              {t(
                'payment.licenseDelayedMessage',
                'Your license key is being generated. Please check your email shortly or contact support.'
              )}
            </Text>
          </Alert>
        )}

        {pollingStatus === 'ready' && (
          <Text size="xs" c="dimmed">
            {t('payment.canCloseWindow', 'You can now close this window.')}
          </Text>
        )}

        <Button onClick={onClose} mt="md">
          {t('common.close', 'Close')}
        </Button>
      </Stack>
    </Alert>
  );
};
