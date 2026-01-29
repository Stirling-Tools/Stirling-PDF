import React, { useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Tooltip, useMantineTheme, useComputedColorScheme, rem, Stack, Text } from '@mantine/core';
import { useBackendHealth } from '@app/hooks/useBackendHealth';
import { useVersionInfo } from '@app/hooks/useVersionInfo';

interface BackendHealthIndicatorProps {
  className?: string;
}

export const BackendHealthIndicator: React.FC<BackendHealthIndicatorProps> = ({
  className = ''
}) => {
  const { t } = useTranslation();
  const theme = useMantineTheme();
  const colorScheme = useComputedColorScheme('light');
  const { status, isHealthy, checkHealth } = useBackendHealth();
  const { desktopVersion, serverVersion } = useVersionInfo();

  const label = useMemo(() => {
    const statusText = status === 'starting'
      ? t('backendHealth.checking', 'Checking backend status...')
      : isHealthy
        ? t('backendHealth.online', 'Backend Online')
        : t('backendHealth.offline', 'Backend Offline');

    const versionLines: string[] = [];

    if (desktopVersion) {
      versionLines.push(`Desktop: ${desktopVersion}`);
    }

    if (serverVersion) {
      versionLines.push(`Server: ${serverVersion}`);
    }

    if (versionLines.length > 0) {
      return (
        <Stack gap={4}>
          <Text size="sm">{statusText}</Text>
          {versionLines.map((line, idx) => (
            <Text key={idx} size="xs" c="dimmed">
              {line}
            </Text>
          ))}
        </Stack>
      );
    }

    return statusText;
  }, [status, isHealthy, t, desktopVersion, serverVersion]);

  const dotColor = useMemo(() => {
    if (status === 'starting') {
      return theme.colors.yellow?.[5] ?? '#fcc419';
    }
    if (isHealthy) {
      return theme.colors.green?.[5] ?? '#37b24d';
    }
    return theme.colors.red?.[6] ?? '#e03131';
  }, [status, isHealthy, theme.colors.green, theme.colors.red, theme.colors.yellow]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      checkHealth();
    }
  }, [checkHealth]);

  return (
    <Tooltip
      label={label}
      position="left"
      offset={12}
      withArrow
      withinPortal
      color={colorScheme === 'dark' ? undefined : 'dark'}
    >
      <Box
        component="span"
        className={className ? `${className}` : undefined}
        role="status"
        aria-live="polite"
        aria-label={label}
        tabIndex={0}
        onClick={checkHealth}
        onKeyDown={handleKeyDown}
        style={{
          width: rem(12),
          height: rem(12),
          borderRadius: '50%',
          backgroundColor: dotColor,
          boxShadow: colorScheme === 'dark'
            ? '0 0 0 2px rgba(255, 255, 255, 0.18)'
            : '0 0 0 2px rgba(0, 0, 0, 0.08)',
          cursor: 'pointer',
          display: 'inline-block',
          outline: 'none',
        }}
      />
    </Tooltip>
  );
};
