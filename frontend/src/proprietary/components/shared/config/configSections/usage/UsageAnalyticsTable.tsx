import React from 'react';
import { Card, Text, Stack, Table } from '@mantine/core';
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

        <Table
          horizontalSpacing="md"
          verticalSpacing="sm"
          withRowBorders
          highlightOnHover
          style={{
            '--table-border-color': 'var(--mantine-color-gray-3)',
          } as React.CSSProperties}
        >
          <Table.Thead>
            <Table.Tr style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
              <Table.Th style={{ fontWeight: 600, color: 'var(--mantine-color-gray-7)' }} fz="sm" w="5%">
                #
              </Table.Th>
              <Table.Th style={{ fontWeight: 600, color: 'var(--mantine-color-gray-7)' }} fz="sm" w="55%">
                {t('usage.table.endpoint', 'Endpoint')}
              </Table.Th>
              <Table.Th style={{ fontWeight: 600, color: 'var(--mantine-color-gray-7)' }} fz="sm" w="20%" ta="right">
                {t('usage.table.visits', 'Visits')}
              </Table.Th>
              <Table.Th style={{ fontWeight: 600, color: 'var(--mantine-color-gray-7)' }} fz="sm" w="20%" ta="right">
                {t('usage.table.percentage', 'Percentage')}
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text ta="center" c="dimmed" py="xl">
                    {t('usage.table.noData', 'No data available')}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              data.map((stat, index) => (
                <Table.Tr key={index}>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {index + 1}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" truncate>
                      {stat.endpoint}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm" fw={600}>
                      {stat.visits.toLocaleString()}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm" c="dimmed">
                      {stat.percentage.toFixed(2)}%
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </Stack>
    </Card>
  );
};

export default UsageAnalyticsTable;
