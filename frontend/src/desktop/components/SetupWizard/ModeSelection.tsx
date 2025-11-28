import React from 'react';
import { Stack, Button, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import CloudIcon from '@mui/icons-material/Cloud';
import ComputerIcon from '@mui/icons-material/Computer';

interface ModeSelectionProps {
  onSelect: (mode: 'saas' | 'selfhosted') => void;
  loading: boolean;
}

export const ModeSelection: React.FC<ModeSelectionProps> = ({ onSelect, loading }) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Button
        size="xl"
        variant="default"
        onClick={() => onSelect('saas')}
        disabled={loading}
        leftSection={<CloudIcon />}
        styles={{
          root: {
            height: 'auto',
            padding: '1.25rem',
          },
          inner: {
            justifyContent: 'flex-start',
          },
          section: {
            marginRight: '1rem',
          },
        }}
      >
        <div style={{ textAlign: 'left', flex: 1 }}>
          <Text fw={600} size="md">{t('setup.mode.saas.title', 'Use SaaS')}</Text>
          <Text size="sm" c="dimmed" fw={400}>
            {t('setup.mode.saas.description', 'Sign in to Stirling PDF cloud service')}
          </Text>
        </div>
      </Button>

      <Button
        size="xl"
        variant="default"
        onClick={() => onSelect('selfhosted')}
        disabled={loading}
        leftSection={<ComputerIcon />}
        styles={{
          root: {
            height: 'auto',
            padding: '1.25rem',
          },
          inner: {
            justifyContent: 'flex-start',
          },
          section: {
            marginRight: '1rem',
          },
        }}
      >
        <div style={{ textAlign: 'left', flex: 1 }}>
          <Text fw={600} size="md">{t('setup.mode.selfhosted.title', 'Self-Hosted Server')}</Text>
          <Text size="sm" c="dimmed" fw={400}>
            {t('setup.mode.selfhosted.description', 'Connect to your own Stirling PDF server with your personal account')}
          </Text>
        </div>
      </Button>
    </Stack>
  );
};
