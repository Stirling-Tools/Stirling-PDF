import React, { useState, useEffect } from 'react';
import {
  Card,
  Text,
  Group,
  Stack,
  SegmentedControl,
  Loader,
  Alert,
  Box,
  SimpleGrid,
} from '@mantine/core';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  ResponsiveContainer,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import auditService, { AuditChartsData } from '@app/services/auditService';

// Event type color mapping
const EVENT_TYPE_COLORS: Record<string, string> = {
  USER_LOGIN: 'var(--mantine-color-green-6)',
  USER_LOGOUT: 'var(--mantine-color-gray-5)',
  USER_FAILED_LOGIN: 'var(--mantine-color-red-6)',
  USER_PROFILE_UPDATE: 'var(--mantine-color-blue-6)',
  SETTINGS_CHANGED: 'var(--mantine-color-orange-6)',
  FILE_OPERATION: 'var(--mantine-color-cyan-6)',
  PDF_PROCESS: 'var(--mantine-color-violet-6)',
  UI_DATA: 'var(--mantine-color-teal-6)',
  HTTP_REQUEST: 'var(--mantine-color-indigo-6)',
};

const getEventTypeColor = (type: string): string => {
  return EVENT_TYPE_COLORS[type] || 'var(--mantine-color-blue-6)';
};

interface AuditChartsSectionProps {
  loginEnabled?: boolean;
  timePeriod?: 'day' | 'week' | 'month';
  onTimePeriodChange?: (period: 'day' | 'week' | 'month') => void;
}

const AuditChartsSection: React.FC<AuditChartsSectionProps> = ({
  loginEnabled = true,
  timePeriod = 'week',
  onTimePeriodChange,
}) => {
  const { t } = useTranslation();
  const [chartsData, setChartsData] = useState<AuditChartsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchChartsData = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await auditService.getChartsData(timePeriod);
        setChartsData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('audit.charts.error', 'Failed to load charts'));
      } finally {
        setLoading(false);
      }
    };

    if (loginEnabled) {
      fetchChartsData();
    } else {
      // Demo data when login disabled
      setChartsData({
        eventsByType: {
          labels: ['LOGIN', 'LOGOUT', 'SETTINGS_CHANGE', 'FILE_UPLOAD', 'FILE_DOWNLOAD'],
          values: [342, 289, 145, 678, 523],
        },
        eventsByUser: {
          labels: ['admin', 'user1', 'user2', 'user3', 'user4'],
          values: [456, 321, 287, 198, 165],
        },
        eventsOverTime: {
          labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          values: [123, 145, 167, 189, 201, 87, 65],
        },
      });
      setLoading(false);
    }
  }, [timePeriod, loginEnabled]);

  if (loading) {
    return (
      <Card padding="lg" radius="md" withBorder>
        <Group justify="center">
          <Loader size="lg" my="xl" />
        </Group>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert color="red" title={t('audit.charts.error', 'Error loading charts')}>
        {error}
      </Alert>
    );
  }

  if (!chartsData) {
    return null;
  }

  // Transform data for Recharts
  const eventsOverTimeData = chartsData.eventsOverTime.labels.map((label, index) => ({
    name: label,
    value: chartsData.eventsOverTime.values[index],
  }));

  const eventsByTypeData = chartsData.eventsByType.labels.map((label, index) => ({
    type: label,
    value: chartsData.eventsByType.values[index],
  }));

  const eventsByUserData = chartsData.eventsByUser.labels.map((label, index) => ({
    user: label,
    value: chartsData.eventsByUser.values[index],
  }));

  return (
    <Stack gap="lg">
      {/* Header with time period selector */}
      <Group justify="space-between" align="center">
        <Text size="lg" fw={600}>
          {t('audit.charts.title', 'Audit Dashboard')}
        </Text>
        <SegmentedControl
          value={timePeriod}
          onChange={(value) => {
            onTimePeriodChange?.(value as 'day' | 'week' | 'month');
          }}
          disabled={!loginEnabled}
          data={[
            { label: t('audit.charts.day', 'Day'), value: 'day' },
            { label: t('audit.charts.week', 'Week'), value: 'week' },
            { label: t('audit.charts.month', 'Month'), value: 'month' },
          ]}
        />
      </Group>

      {/* Full-width Events Over Time Chart */}
      <Card padding="lg" radius="md" withBorder>
        <Stack gap="md">
          <Text size="md" fw={600}>
            {t('audit.charts.overTime', 'Events Over Time')}
          </Text>
          <Box style={{ width: '100%', height: 280 }}>
            {eventsOverTimeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={eventsOverTimeData}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--mantine-color-blue-6)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--mantine-color-blue-6)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--mantine-color-gray-2)" />
                  <XAxis dataKey="name" stroke="var(--mantine-color-gray-6)" />
                  <YAxis stroke="var(--mantine-color-gray-6)" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--mantine-color-gray-8)',
                      border: 'none',
                      borderRadius: 'var(--mantine-radius-md)',
                      color: 'var(--mantine-color-gray-0)',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="var(--mantine-color-blue-6)"
                    fillOpacity={1}
                    fill="url(#colorValue)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <Group justify="center">
                <Text c="dimmed">{t('audit.charts.noData', 'No data for this period')}</Text>
              </Group>
            )}
          </Box>
        </Stack>
      </Card>

      {/* Two-column grid for remaining charts */}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        {/* Events by Type Chart */}
        <Card padding="lg" radius="md" withBorder>
          <Stack gap="md">
            <Text size="md" fw={600}>
              {t('audit.charts.byType', 'Events by Type')}
            </Text>
            <Box style={{ width: '100%', height: 280 }}>
              {eventsByTypeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={eventsByTypeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--mantine-color-gray-2)" />
                    <XAxis dataKey="type" stroke="var(--mantine-color-gray-6)" angle={-45} textAnchor="end" height={80} />
                    <YAxis stroke="var(--mantine-color-gray-6)" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--mantine-color-gray-8)',
                        border: 'none',
                        borderRadius: 'var(--mantine-radius-md)',
                        color: 'var(--mantine-color-gray-0)',
                      }}
                    />
                    <Bar dataKey="value" fill="var(--mantine-color-blue-6)">
                      {eventsByTypeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={getEventTypeColor(entry.type)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Group justify="center">
                  <Text c="dimmed">{t('audit.charts.noData', 'No data')}</Text>
                </Group>
              )}
            </Box>
          </Stack>
        </Card>

        {/* Top Users Chart (Horizontal) */}
        <Card padding="lg" radius="md" withBorder>
          <Stack gap="md">
            <Text size="md" fw={600}>
              {t('audit.charts.byUser', 'Top Users')}
            </Text>
            <Box style={{ width: '100%', height: 280 }}>
              {eventsByUserData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={eventsByUserData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--mantine-color-gray-2)" />
                    <XAxis type="number" stroke="var(--mantine-color-gray-6)" />
                    <YAxis type="category" dataKey="user" stroke="var(--mantine-color-gray-6)" width={100} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--mantine-color-gray-8)',
                        border: 'none',
                        borderRadius: 'var(--mantine-radius-md)',
                        color: 'var(--mantine-color-gray-0)',
                      }}
                    />
                    <Bar dataKey="value" fill="var(--mantine-color-green-6)" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Group justify="center">
                  <Text c="dimmed">{t('audit.charts.noData', 'No data')}</Text>
                </Group>
              )}
            </Box>
          </Stack>
        </Card>
      </SimpleGrid>
    </Stack>
  );
};

export default AuditChartsSection;
