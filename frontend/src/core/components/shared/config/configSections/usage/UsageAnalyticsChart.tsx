import React from 'react';
import { Card, Text, Stack, Group, Box } from '@mantine/core';
import { useTranslation } from 'react-i18next';

interface SimpleBarChartProps {
  data: { label: string; value: number }[];
  maxValue: number;
}

const SimpleBarChart: React.FC<SimpleBarChartProps> = ({ data, maxValue }) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm">
      {data.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">
          {t('usage.noData', 'No data available')}
        </Text>
      ) : (
        data.map((item, index) => (
          <Box key={index}>
            <Group justify="space-between" mb={4}>
              <Text
                size="xs"
                c="dimmed"
                maw="60%"
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.label}
              </Text>
              <Group gap="xs">
                <Text size="xs" fw={600}>
                  {item.value}
                </Text>
                <Text size="xs" c="dimmed">
                  ({((item.value / maxValue) * 100).toFixed(1)}%)
                </Text>
              </Group>
            </Group>
            <Box
              style={{
                width: '100%',
                height: '0.5rem',
                backgroundColor: 'var(--mantine-color-gray-2)',
                borderRadius: 'var(--mantine-radius-sm)',
                overflow: 'hidden',
              }}
            >
              <Box
                style={{
                  width: `${(item.value / maxValue) * 100}%`,
                  height: '100%',
                  backgroundColor: 'var(--mantine-color-blue-6)',
                  transition: 'width 0.3s ease',
                }}
              />
            </Box>
          </Box>
        ))
      )}
    </Stack>
  );
};

interface UsageAnalyticsChartProps {
  data: { label: string; value: number }[];
}

const UsageAnalyticsChart: React.FC<UsageAnalyticsChartProps> = ({ data }) => {
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
