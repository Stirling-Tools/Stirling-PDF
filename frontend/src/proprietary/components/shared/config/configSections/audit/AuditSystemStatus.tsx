import React from 'react';
import { Card, Group, Stack, Badge, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { AuditSystemStatus as AuditStatus } from '@app/services/auditService';

interface AuditSystemStatusProps {
  status: AuditStatus;
}

const AuditSystemStatus: React.FC<AuditSystemStatusProps> = ({ status }) => {
  const { t } = useTranslation();

  return (
    <Card padding="lg" radius="md" withBorder>
      <Stack gap="md">
        <Text size="lg" fw={600}>
          {t('audit.systemStatus.title', 'System Status')}
        </Text>

        <Group justify="space-between">
          <div>
            <Text size="sm" c="dimmed">
              {t('audit.systemStatus.status', 'Audit Logging')}
            </Text>
            <Badge color={status.enabled ? 'green' : 'red'} variant="light" size="lg" mt="xs">
              {status.enabled
                ? t('audit.systemStatus.enabled', 'Enabled')
                : t('audit.systemStatus.disabled', 'Disabled')}
            </Badge>
          </div>

          <div>
            <Text size="sm" c="dimmed">
              {t('audit.systemStatus.level', 'Audit Level')}
            </Text>
            <Text size="lg" fw={600} mt="xs">
              {status.level}
            </Text>
          </div>

          <div>
            <Text size="sm" c="dimmed">
              {t('audit.systemStatus.retention', 'Retention Period')}
            </Text>
            <Text size="lg" fw={600} mt="xs">
              {status.retentionDays} {t('audit.systemStatus.days', 'days')}
            </Text>
          </div>

          <div>
            <Text size="sm" c="dimmed">
              {t('audit.systemStatus.totalEvents', 'Total Events')}
            </Text>
            <Text size="lg" fw={600} mt="xs">
              {status.totalEvents.toLocaleString()}
            </Text>
          </div>
        </Group>
      </Stack>
    </Card>
  );
};

export default AuditSystemStatus;
