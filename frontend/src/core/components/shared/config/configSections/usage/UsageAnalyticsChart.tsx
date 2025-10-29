import React from 'react';
import { Card, Text, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';

interface SimpleBarChartProps {
  data: { label: string; value: number }[];
  maxValue: number;
}

const SimpleBarChart: React.FC<SimpleBarChartProps> = ({ data, maxValue }) => {
  const { t } = useTranslation();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {data.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">
          {t('usage.noData', 'No data available')}
        </Text>
      ) : (
        data.map((item, index) => (
          <div key={index}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }} mb={4}>
              <Text
                size="xs"
                c="dimmed"
                style={{
                  maxWidth: '60%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.label}
              </Text>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Text size="xs" fw={600}>
                  {item.value}
                </Text>
                <Text size="xs" c="dimmed">
                  ({((item.value / maxValue) * 100).toFixed(1)}%)
                </Text>
              </div>
            </div>
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
                  backgroundColor: 'var(--mantine-color-blue-6)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
};

interface UsageAnalyticsChartProps {
  data: { label: string; value: number }[];
  totalVisits: number;
}

const UsageAnalyticsChart: React.FC<UsageAnalyticsChartProps> = ({ data, totalVisits }) => {
  const { t } = useTranslation();

  return (
    <Card padding="lg" radius="md" withBorder>
      <Stack gap="md">
        <Text size="lg" fw={600}>
          {t('usage.chart.title', 'Endpoint Usage Chart')}
        </Text>
        <SimpleBarChart data={data} maxValue={Math.max(...data.map((d) => d.value), 1)} />
      </Stack>
    </Card>
  );
};

export default UsageAnalyticsChart;
