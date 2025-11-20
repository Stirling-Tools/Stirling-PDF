import React from 'react';
import { Stack, Button, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import CloudIcon from '@mui/icons-material/Cloud';
import ComputerIcon from '@mui/icons-material/Computer';

interface ModeSelectionProps {
  onSelect: (mode: 'offline' | 'server') => void;
  loading: boolean;
}

export const ModeSelection: React.FC<ModeSelectionProps> = ({ onSelect, loading }) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Button
        size="xl"
        variant="default"
        onClick={() => onSelect('offline')}
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
        }}
      >
        <div style={{ textAlign: 'left', flex: 1 }}>
          <Text fw={600} size="md">{t('setup.mode.offline.title', 'Use Offline')}</Text>
          <Text size="sm" c="dimmed" fw={400}>
            {t('setup.mode.offline.description', 'Run locally without an internet connection')}
          </Text>
        </div>
      </Button>

      <Button
        size="xl"
        variant="default"
        onClick={() => onSelect('server')}
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
        }}
      >
        <div style={{ textAlign: 'left', flex: 1 }}>
          <Text fw={600} size="md">{t('setup.mode.server.title', 'Connect to Server')}</Text>
          <Text size="sm" c="dimmed" fw={400}>
            {t('setup.mode.server.description', 'Connect to a remote Stirling PDF server')}
          </Text>
        </div>
      </Button>
    </Stack>
  );
};
