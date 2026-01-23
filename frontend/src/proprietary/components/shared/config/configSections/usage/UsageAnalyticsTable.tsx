import React from 'react';
import {
  Card,
  Text,
  Stack,
  Table,
  TableThead,
  TableTbody,
  TableTr,
  TableTh,
  TableTd,
} from '@mantine/core';
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
          <TableThead>
            <TableTr style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
              <TableTh style={{ fontWeight: 600, color: 'var(--mantine-color-gray-7)' }} fz="sm" w="5%">
                #
              </TableTh>
              <TableTh style={{ fontWeight: 600, color: 'var(--mantine-color-gray-7)' }} fz="sm" w="55%">
                {t('usage.table.endpoint', 'Endpoint')}
              </TableTh>
              <TableTh style={{ fontWeight: 600, color: 'var(--mantine-color-gray-7)' }} fz="sm" w="20%" ta="right">
                {t('usage.table.visits', 'Visits')}
              </TableTh>
              <TableTh style={{ fontWeight: 600, color: 'var(--mantine-color-gray-7)' }} fz="sm" w="20%" ta="right">
                {t('usage.table.percentage', 'Percentage')}
              </TableTh>
            </TableTr>
          </TableThead>
          <TableTbody>
            {data.length === 0 ? (
              <TableTr>
                <TableTd colSpan={4}>
                  <Text ta="center" c="dimmed" py="xl">
                    {t('usage.table.noData', 'No data available')}
                  </Text>
                </TableTd>
              </TableTr>
            ) : (
              data.map((stat, index) => (
                <TableTr key={index}>
                  <TableTd>
                    <Text size="sm" c="dimmed">
                      {index + 1}
                    </Text>
                  </TableTd>
                  <TableTd>
                    <Text size="sm" truncate>
                      {stat.endpoint}
                    </Text>
                  </TableTd>
                  <TableTd ta="right">
                    <Text size="sm" fw={600}>
                      {stat.visits.toLocaleString()}
                    </Text>
                  </TableTd>
                  <TableTd ta="right">
                    <Text size="sm" c="dimmed">
                      {stat.percentage.toFixed(2)}%
                    </Text>
                  </TableTd>
                </TableTr>
              ))
            )}
          </TableTbody>
        </Table>
      </Stack>
    </Card>
  );
};

export default UsageAnalyticsTable;
