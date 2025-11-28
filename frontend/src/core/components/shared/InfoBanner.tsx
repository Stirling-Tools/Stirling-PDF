import React, { ReactNode } from 'react';
import { Paper, Group, Text, Button, ActionIcon, Stack } from '@mantine/core';
import LocalIcon from '@app/components/shared/LocalIcon';

type InfoBannerTone = 'info' | 'warning';

const toneStyles: Record<
  InfoBannerTone,
  {
    background: string;
    border: string;
    text: string;
    icon: string;
    buttonColor: string;
  }
> = {
  info: {
    background: 'var(--mantine-color-blue-0)',
    border: 'var(--mantine-color-blue-2)',
    text: 'var(--mantine-color-blue-9)',
    icon: 'var(--mantine-color-blue-6)',
    buttonColor: 'blue',
  },
  warning: {
    background: 'var(--mantine-color-orange-0)',
    border: 'var(--mantine-color-orange-3)',
    text: 'var(--mantine-color-orange-9)',
    icon: 'var(--mantine-color-orange-7)',
    buttonColor: 'orange',
  },
};

interface InfoBannerProps {
  icon: string;
  title?: ReactNode;
  message: ReactNode;
  buttonText?: string;
  buttonIcon?: string;
  onButtonClick?: () => void;
  onDismiss?: () => void;
  dismissible?: boolean;
  loading?: boolean;
  show?: boolean;
  tone?: InfoBannerTone;
  background?: string;
  borderColor?: string;
  textColor?: string;
  iconColor?: string;
  buttonColor?: string;
  buttonVariant?: 'light' | 'filled' | 'white' | 'outline' | 'subtle';
  minHeight?: number | string;
  closeIconColor?: string;
}

/**
 * Generic info banner component for displaying dismissible messages at the top of the app
 */
export const InfoBanner: React.FC<InfoBannerProps> = ({
  icon,
  title,
  message,
  buttonText,
  buttonIcon = 'check-circle-rounded',
  onButtonClick,
  onDismiss,
  dismissible = true,
  loading = false,
  show = true,
  tone = 'info',
  background,
  borderColor,
  textColor,
  iconColor,
  buttonColor,
  buttonVariant = 'light',
  minHeight = 56,
  closeIconColor,
}) => {
  if (!show) {
    return null;
  }

  const toneStyle = toneStyles[tone] ?? toneStyles.info;
  const handleDismiss = () => {
    onDismiss?.();
  };

  return (
    <Paper
      p="sm"
      radius={0}
      style={{
        background: background ?? toneStyle.background,
        borderBottom: `1px solid ${borderColor ?? toneStyle.border}`,
        minHeight,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <Group gap="sm" align="center" wrap="nowrap" justify="space-between" style={{ width: '100%' }}>
        <Group gap="sm" align="center" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <LocalIcon
            icon={icon}
            width="1.2rem"
            height="1.2rem"
            style={{ color: iconColor ?? toneStyle.icon, flexShrink: 0 }}
          />
          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
            {title && (
              <Text fw={600} size="sm" style={{ color: textColor ?? toneStyle.text }}>
                {title}
              </Text>
            )}
            <Text
              fw={title ? 400 : 500}
              size="sm"
              style={{ color: textColor ?? toneStyle.text }}
              lineClamp={2}
            >
              {message}
            </Text>
          </Stack>
        </Group>
        <Group gap="xs" align="center" wrap="nowrap">
          {buttonText && onButtonClick && (
            <Button
              variant={buttonVariant}
              color={buttonColor ?? toneStyle.buttonColor}
              size="xs"
              onClick={onButtonClick}
              loading={loading}
              leftSection={<LocalIcon icon={buttonIcon} width="0.9rem" height="0.9rem" />}
              styles={{
                label: {
                  color: textColor ?? toneStyle.text,
                },
              }}
            >
              {buttonText}
            </Button>
          )}
          {dismissible && (
            <ActionIcon
              variant="subtle"
              color={closeIconColor ? undefined : 'gray'}
              size="sm"
              onClick={handleDismiss}
              aria-label="Dismiss"
              style={closeIconColor ? { color: closeIconColor } : undefined}
            >
              <LocalIcon icon="close-rounded" width="1rem" height="1rem" />
            </ActionIcon>
          )}
        </Group>
      </Group>
    </Paper>
  );
};
