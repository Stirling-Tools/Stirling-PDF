import React, { useState, useEffect } from 'react';
import { Card, Group, Stack, Text, Badge, SimpleGrid, Loader, Alert } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import auditService, { AuditStats } from '@app/services/auditService';
import LocalIcon from '@app/components/shared/LocalIcon';

interface AuditStatsCardsProps {
  loginEnabled?: boolean;
  timePeriod: 'day' | 'week' | 'month';
}

const AuditStatsCards: React.FC<AuditStatsCardsProps> = ({ loginEnabled = true, timePeriod = 'week' }) => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await auditService.getStats(timePeriod);
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load statistics');
      } finally {
        setLoading(false);
      }
    };

    if (loginEnabled) {
      fetchStats();
    } else {
      // Demo data when login disabled
      setStats({
        totalEvents: 4256,
        prevTotalEvents: 3891,
        uniqueUsers: 12,
        prevUniqueUsers: 10,
        successRate: 96.5,
        prevSuccessRate: 94.2,
        avgLatencyMs: 342,
        prevAvgLatencyMs: 385,
        errorCount: 148,
        topEventType: 'PDF_PROCESS',
        topUser: 'admin',
        eventsByType: {},
        eventsByUser: {},
        topTools: {},
        hourlyDistribution: {},
      });
      setLoading(false);
    }
  }, [timePeriod, loginEnabled]);

  if (loading) {
    return (
      <Card padding="lg" radius="md" withBorder>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '2rem 0' }}>
          <Loader size="lg" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert color="red" title={t('audit.stats.error', 'Error loading statistics')}>
        {error}
      </Alert>
    );
  }

  if (!stats) {
    return null;
  }

  const trendPercent = stats.prevTotalEvents > 0 ? ((stats.totalEvents - stats.prevTotalEvents) / stats.prevTotalEvents) * 100 : 0;
  const userTrend = stats.prevUniqueUsers > 0 ? ((stats.uniqueUsers - stats.prevUniqueUsers) / stats.prevUniqueUsers) * 100 : 0;
  const latencyTrend = stats.prevAvgLatencyMs > 0 ? ((stats.avgLatencyMs - stats.prevAvgLatencyMs) / stats.prevAvgLatencyMs) * 100 : 0;
  const successTrend = stats.prevSuccessRate > 0 ? stats.successRate - stats.prevSuccessRate : 0;

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 95) return 'green';
    if (rate >= 80) return 'yellow';
    return 'red';
  };

  const getTrendColor = (trend: number, lowerIsBetter: boolean = false) => {
    if (lowerIsBetter) {
      return trend <= 0 ? 'green' : 'red';
    }
    return trend >= 0 ? 'green' : 'red';
  };

  const getTrendIcon = (trend: number, lowerIsBetter: boolean = false) => {
    const isPositive = lowerIsBetter ? trend <= 0 : trend >= 0;
    return isPositive ? 'trending-up' : 'trending-down';
  };

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="lg">
      {/* Total Events Card */}
      <Card padding="lg" radius="md" withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              {t('audit.stats.totalEvents', 'Total Events')}
            </Text>
            <LocalIcon icon="analytics" width="1.2rem" height="1.2rem" />
          </Group>
          <Text size="xl" fw={700}>
            {stats.totalEvents.toLocaleString()}
          </Text>
          {trendPercent !== 0 && (
            <Badge
              color={getTrendColor(trendPercent)}
              variant="light"
              size="sm"
              leftSection={
                <LocalIcon
                  icon={getTrendIcon(trendPercent)}
                  width="0.8rem"
                  height="0.8rem"
                  style={{ marginRight: '0.25rem' }}
                />
              }
            >
              {Math.abs(trendPercent).toFixed(1)}% {t('audit.stats.vsLastPeriod', 'vs last period')}
            </Badge>
          )}
        </Stack>
      </Card>

      {/* Success Rate Card */}
      <Card padding="lg" radius="md" withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              {t('audit.stats.successRate', 'Success Rate')}
            </Text>
            <LocalIcon icon="check-circle-rounded" width="1.2rem" height="1.2rem" />
          </Group>
          <Text size="xl" fw={700}>
            {stats.successRate.toFixed(1)}%
          </Text>
          <Group gap="xs">
            <Badge color={getSuccessRateColor(stats.successRate)} variant="light" size="sm">
              {stats.successRate >= 95
                ? t('audit.stats.excellent', 'Excellent')
                : stats.successRate >= 80
                  ? t('audit.stats.good', 'Good')
                  : t('audit.stats.attention', 'Attention needed')}
            </Badge>
            {successTrend !== 0 && (
              <Badge color={getTrendColor(successTrend)} variant="light" size="xs">
                {successTrend > 0 ? '+' : ''}{successTrend.toFixed(1)}%
              </Badge>
            )}
          </Group>
        </Stack>
      </Card>

      {/* Active Users Card */}
      <Card padding="lg" radius="md" withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              {t('audit.stats.activeUsers', 'Active Users')}
            </Text>
            <LocalIcon icon="group" width="1.2rem" height="1.2rem" />
          </Group>
          <Text size="xl" fw={700}>
            {stats.uniqueUsers}
          </Text>
          {userTrend !== 0 && (
            <Badge
              color={getTrendColor(userTrend)}
              variant="light"
              size="sm"
              leftSection={
                <LocalIcon
                  icon={getTrendIcon(userTrend)}
                  width="0.8rem"
                  height="0.8rem"
                  style={{ marginRight: '0.25rem' }}
                />
              }
            >
              {Math.abs(userTrend).toFixed(1)}%
            </Badge>
          )}
        </Stack>
      </Card>

      {/* Avg Latency Card */}
      <Card padding="lg" radius="md" withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              {t('audit.stats.avgLatency', 'Avg Latency')}
            </Text>
            <LocalIcon icon="speed" width="1.2rem" height="1.2rem" />
          </Group>
          <Text size="xl" fw={700}>
            {stats.avgLatencyMs > 0 ? `${stats.avgLatencyMs.toFixed(0)}ms` : t('audit.stats.noData', 'N/A')}
          </Text>
          {latencyTrend !== 0 && stats.avgLatencyMs > 0 && (
            <Badge
              color={getTrendColor(latencyTrend, true)}
              variant="light"
              size="sm"
              leftSection={
                <LocalIcon
                  icon={getTrendIcon(latencyTrend, true)}
                  width="0.8rem"
                  height="0.8rem"
                  style={{ marginRight: '0.25rem' }}
                />
              }
            >
              {Math.abs(latencyTrend).toFixed(1)}%
            </Badge>
          )}
        </Stack>
      </Card>
    </SimpleGrid>
  );
};

export default AuditStatsCards;
