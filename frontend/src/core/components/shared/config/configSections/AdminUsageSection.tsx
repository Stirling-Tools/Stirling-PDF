import React, { useState, useEffect } from 'react';
import {
  Stack,
  Group,
  Text,
  Button,
  SegmentedControl,
  Loader,
  Alert,
  Card,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import usageAnalyticsService, { EndpointStatisticsResponse } from '@app/services/usageAnalyticsService';
import UsageAnalyticsChart from './usage/UsageAnalyticsChart';
import UsageAnalyticsTable from './usage/UsageAnalyticsTable';
import LocalIcon from '@app/components/shared/LocalIcon';

const AdminUsageSection: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<EndpointStatisticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<'top10' | 'top20' | 'all'>('top10');
  const [dataType, setDataType] = useState<'all' | 'api' | 'ui'>('all');

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const limit = displayMode === 'all' ? undefined : displayMode === 'top10' ? 10 : 20;
      const response = await usageAnalyticsService.getEndpointStatistics(limit, dataType);

      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load usage statistics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [displayMode, dataType]);

  const handleRefresh = () => {
    fetchData();
  };

  const getDisplayModeLabel = () => {
    switch (displayMode) {
      case 'top10':
        return t('usage.showing.top10', 'Top 10');
      case 'top20':
        return t('usage.showing.top20', 'Top 20');
      case 'all':
        return t('usage.showing.all', 'All');
      default:
        return '';
    }
  };

  // Early returns for loading/error states
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
        <Loader size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert color="red" title={t('usage.error', 'Error loading usage statistics')}>
        {error}
      </Alert>
    );
  }

  if (!data) {
    return (
      <Alert color="yellow" title={t('usage.noData', 'No data available')}>
        {t('usage.noDataMessage', 'No usage statistics are currently available.')}
      </Alert>
    );
  }

  const chartData = data.endpoints.map((e) => ({ label: e.endpoint, value: e.visits }));

  const displayedVisits = data.endpoints.reduce((sum, e) => sum + e.visits, 0);

  const displayedPercentage = data.totalVisits > 0
    ? ((displayedVisits / data.totalVisits) * 100).toFixed(1)
    : '0';

  return (
    <Stack gap="lg">
      {/* Controls */}
      <Card padding="lg" radius="md" withBorder>
        <Stack gap="md">
          <Group justify="space-between" wrap="wrap">
            <Group>
              <SegmentedControl
                value={displayMode}
                onChange={(value) => setDisplayMode(value as 'top10' | 'top20' | 'all')}
                data={[
                  {
                    value: 'top10',
                    label: t('usage.controls.top10', 'Top 10'),
                  },
                  {
                    value: 'top20',
                    label: t('usage.controls.top20', 'Top 20'),
                  },
                  {
                    value: 'all',
                    label: t('usage.controls.all', 'All'),
                  },
                ]}
              />
              <Button
                variant="outline"
                leftSection={<LocalIcon icon="refresh" width="1rem" height="1rem" />}
                onClick={handleRefresh}
                loading={loading}
              >
                {t('usage.controls.refresh', 'Refresh')}
              </Button>
            </Group>
          </Group>

          <Group>
            <Text size="sm" fw={500}>
              {t('usage.controls.dataTypeLabel', 'Data Type:')}
            </Text>
            <SegmentedControl
              value={dataType}
              onChange={(value) => setDataType(value as 'all' | 'api' | 'ui')}
              data={[
                {
                  value: 'all',
                  label: t('usage.controls.dataType.all', 'All'),
                },
                {
                  value: 'api',
                  label: t('usage.controls.dataType.api', 'API'),
                },
                {
                  value: 'ui',
                  label: t('usage.controls.dataType.ui', 'UI'),
                },
              ]}
            />
          </Group>

          {/* Statistics Summary */}
          <Group gap="xl" style={{ flexWrap: 'wrap' }}>
            <div>
              <Text size="sm" c="dimmed">
                {t('usage.stats.totalEndpoints', 'Total Endpoints')}
              </Text>
              <Text size="lg" fw={600}>
                {data.totalEndpoints}
              </Text>
            </div>
            <div>
              <Text size="sm" c="dimmed">
                {t('usage.stats.totalVisits', 'Total Visits')}
              </Text>
              <Text size="lg" fw={600}>
                {data.totalVisits.toLocaleString()}
              </Text>
            </div>
            <div>
              <Text size="sm" c="dimmed">
                {t('usage.stats.showing', 'Showing')}
              </Text>
              <Text size="lg" fw={600}>
                {getDisplayModeLabel()}
              </Text>
            </div>
            <div>
              <Text size="sm" c="dimmed">
                {t('usage.stats.selectedVisits', 'Selected Visits')}
              </Text>
              <Text size="lg" fw={600}>
                {displayedVisits.toLocaleString()} ({displayedPercentage}%)
              </Text>
            </div>
          </Group>
        </Stack>
      </Card>

      {/* Chart and Table */}
      <UsageAnalyticsChart data={chartData} totalVisits={data.totalVisits} />
      <UsageAnalyticsTable data={data.endpoints} totalVisits={data.totalVisits} />
    </Stack>
  );
};

export default AdminUsageSection;
