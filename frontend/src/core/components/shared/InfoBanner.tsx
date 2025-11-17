import React from 'react';
import { Paper, Group, Text, Button, ActionIcon } from '@mantine/core';
import LocalIcon from '@app/components/shared/LocalIcon';

interface InfoBannerProps {
  icon: string;
  message: string;
  buttonText: string;
  buttonIcon?: string;
  onButtonClick: () => void;
  onDismiss: () => void;
  loading?: boolean;
  show?: boolean;
}

/**
 * Generic info banner component for displaying dismissible messages at the top of the app
 */
export const InfoBanner: React.FC<InfoBannerProps> = ({
  icon,
  message,
  buttonText,
  buttonIcon = 'check-circle-rounded',
  onButtonClick,
  onDismiss,
  loading = false,
  show = true,
}) => {
  if (!show) {
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
        <LocalIcon icon={icon} width="1.2rem" height="1.2rem" style={{ color: 'var(--mantine-color-blue-6)', flexShrink: 0 }} />
        <Text fw={500} size="sm" style={{ color: 'var(--mantine-color-blue-9)' }}>
          {message}
        </Text>
        <Button
          variant="light"
          color="blue"
          size="xs"
          onClick={onButtonClick}
          loading={loading}
          leftSection={<LocalIcon icon={buttonIcon} width="0.9rem" height="0.9rem" />}
          style={{ flexShrink: 0 }}
        >
          {buttonText}
        </Button>
      </Group>
      <ActionIcon
        variant="subtle"
        color="gray"
        size="sm"
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{ position: 'absolute', top: '50%', right: '0.5rem', transform: 'translateY(-50%)' }}
      >
        <LocalIcon icon="close-rounded" width="1rem" height="1rem" />
      </ActionIcon>
    </Paper>
  );
};
