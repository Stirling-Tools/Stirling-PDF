import React from 'react';
import { Card, Text, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { EndpointStatistic } from '@app/services/usageAnalyticsService';

interface UsageAnalyticsTableProps {
  data: EndpointStatistic[];
}

const UsageAnalyticsTable: React.FC<UsageAnalyticsTableProps> = ({ data }) => {
  const { t } = useTranslation();

  return (
    <Card padding="lg" radius="md" withBorder>
      <Stack gap="md">
        <Text size="lg" fw={600}>
          {t('usage.table.title', 'Detailed Statistics')}
        </Text>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr
                style={{
                  borderBottom: '2px solid var(--mantine-color-gray-3)',
                }}
              >
                <th
                  style={{
                    textAlign: 'left',
                    fontSize: '0.875rem',
                    width: '5%',
                  }}
                >
                  #
                </th>
                <th
                  style={{
                    textAlign: 'left',
                    fontSize: '0.875rem',
                    width: '55%',
                  }}
                >
                  {t('usage.table.endpoint', 'Endpoint')}
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    fontSize: '0.875rem',
                    width: '20%',
                  }}
                >
                  {t('usage.table.visits', 'Visits')}
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    fontSize: '0.875rem',
                    width: '20%',
                  }}
                >
                  {t('usage.table.percentage', 'Percentage')}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '2rem' }}>
                    <Text c="dimmed">{t('usage.table.noData', 'No data available')}</Text>
                  </td>
                </tr>
              ) : (
                data.map((stat, index) => (
                  <tr
                    key={index}
                    style={{
                      borderBottom: '1px solid var(--mantine-color-gray-2)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--mantine-color-gray-0)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <td>
                      <Text size="sm" c="dimmed">
                        {index + 1}
                      </Text>
                    </td>
                    <td>
                      <Text
                        size="sm"
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {stat.endpoint}
                      </Text>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Text size="sm" fw={600}>
                        {stat.visits.toLocaleString()}
                      </Text>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Text size="sm" c="dimmed">
                        {stat.percentage.toFixed(2)}%
                      </Text>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Stack>
    </Card>
  );
};

export default UsageAnalyticsTable;
