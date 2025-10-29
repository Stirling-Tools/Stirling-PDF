import React, { useState, useEffect } from 'react';
import { Card, Text, Group, Stack, SegmentedControl, Loader, Alert } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import auditService, { AuditChartsData } from '@app/services/auditService';

interface SimpleBarChartProps {
  data: { label: string; value: number }[];
  title: string;
  color?: string;
}

const SimpleBarChart: React.FC<SimpleBarChartProps> = ({ data, title, color = 'blue' }) => {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <Stack gap="sm">
      <Text size="sm" fw={600}>
        {title}
      </Text>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {data.map((item, index) => (
          <div key={index}>
            <Group justify="space-between" mb={4}>
              <Text size="xs" c="dimmed" maw={200} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.label}
              </Text>
              <Text size="xs" fw={600}>
                {item.value}
              </Text>
            </Group>
            <div
              style={{
                width: '100%',
                height: 8,
                backgroundColor: 'var(--mantine-color-gray-2)',
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${(item.value / maxValue) * 100}%`,
                  height: '100%',
                  backgroundColor: `var(--mantine-color-${color}-6)`,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </Stack>
  );
};

interface AuditChartsSectionProps {}

const AuditChartsSection: React.FC<AuditChartsSectionProps> = () => {
  const { t } = useTranslation();
  const [timePeriod, setTimePeriod] = useState<'day' | 'week' | 'month'>('week');
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
        setError(err instanceof Error ? err.message : 'Failed to load charts');
      } finally {
        setLoading(false);
      }
    };

    fetchChartsData();
  }, [timePeriod]);

  if (loading) {
    return (
      <Card padding="lg" radius="md" withBorder>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Loader size="lg" my="xl" />
        </div>
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

  const eventsByTypeData = chartsData.eventsByType.labels.map((label, index) => ({
    label,
    value: chartsData.eventsByType.values[index],
  }));

  const eventsByUserData = chartsData.eventsByUser.labels.map((label, index) => ({
    label,
    value: chartsData.eventsByUser.values[index],
  }));

  const eventsOverTimeData = chartsData.eventsOverTime.labels.map((label, index) => ({
    label,
    value: chartsData.eventsOverTime.values[index],
  }));

  return (
    <Card padding="lg" radius="md" withBorder>
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Text size="lg" fw={600}>
            {t('audit.charts.title', 'Audit Dashboard')}
          </Text>
          <SegmentedControl
            value={timePeriod}
            onChange={(value) => setTimePeriod(value as 'day' | 'week' | 'month')}
            data={[
              { label: t('audit.charts.day', 'Day'), value: 'day' },
              { label: t('audit.charts.week', 'Week'), value: 'week' },
              { label: t('audit.charts.month', 'Month'), value: 'month' },
            ]}
          />
        </Group>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1.5rem',
          }}
        >
          <SimpleBarChart
            data={eventsByTypeData}
            title={t('audit.charts.byType', 'Events by Type')}
            color="blue"
          />
          <SimpleBarChart
            data={eventsByUserData}
            title={t('audit.charts.byUser', 'Events by User')}
            color="green"
          />
          <SimpleBarChart
            data={eventsOverTimeData}
            title={t('audit.charts.overTime', 'Events Over Time')}
            color="purple"
          />
        </div>
      </Stack>
    </Card>
  );
};

export default AuditChartsSection;
