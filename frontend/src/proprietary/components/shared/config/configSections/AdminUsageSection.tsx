import React, { useState, useEffect, useCallback } from 'react';
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
import UsageAnalyticsChart from '@app/components/shared/config/configSections/usage/UsageAnalyticsChart';
import UsageAnalyticsTable from '@app/components/shared/config/configSections/usage/UsageAnalyticsTable';
import LocalIcon from '@app/components/shared/LocalIcon';
import { useLoginRequired } from '@app/hooks/useLoginRequired';
import LoginRequiredBanner from '@app/components/shared/config/LoginRequiredBanner';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import EnterpriseRequiredBanner from '@app/components/shared/config/EnterpriseRequiredBanner';

const AdminUsageSection: React.FC = () => {
  const { t } = useTranslation();
  const { loginEnabled, validateLoginEnabled } = useLoginRequired();
  const { config } = useAppConfig();
  const runningEE = config?.runningEE ?? false;
  const showDemoData = !loginEnabled || !runningEE;
  const [data, setData] = useState<EndpointStatisticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<'top10' | 'top20' | 'all'>('top10');
  const [dataType, setDataType] = useState<'all' | 'api' | 'ui'>('all');

  const buildDemoUsageData = useCallback((): EndpointStatisticsResponse => {
    const totalVisits = 15847;
    const allEndpoints = [
      { endpoint: 'merge-pdfs', visits: 3245, percentage: (3245 / totalVisits) * 100 },
      { endpoint: 'compress-pdf', visits: 2891, percentage: (2891 / totalVisits) * 100 },
      { endpoint: 'pdf-to-img', visits: 2156, percentage: (2156 / totalVisits) * 100 },
      { endpoint: 'split-pdf', visits: 1834, percentage: (1834 / totalVisits) * 100 },
      { endpoint: 'rotate-pdf', visits: 1523, percentage: (1523 / totalVisits) * 100 },
      { endpoint: 'ocr-pdf', visits: 1287, percentage: (1287 / totalVisits) * 100 },
      { endpoint: 'add-watermark', visits: 945, percentage: (945 / totalVisits) * 100 },
      { endpoint: 'extract-images', visits: 782, percentage: (782 / totalVisits) * 100 },
      { endpoint: 'add-password', visits: 621, percentage: (621 / totalVisits) * 100 },
      { endpoint: 'html-to-pdf', visits: 563, percentage: (563 / totalVisits) * 100 },
      { endpoint: 'remove-password', visits: 487, percentage: (487 / totalVisits) * 100 },
      { endpoint: 'pdf-to-pdfa', visits: 423, percentage: (423 / totalVisits) * 100 },
      { endpoint: 'extract-pdf-metadata', visits: 356, percentage: (356 / totalVisits) * 100 },
      { endpoint: 'add-page-numbers', visits: 298, percentage: (298 / totalVisits) * 100 },
      { endpoint: 'crop', visits: 245, percentage: (245 / totalVisits) * 100 },
      { endpoint: 'flatten', visits: 187, percentage: (187 / totalVisits) * 100 },
      { endpoint: 'sanitize-pdf', visits: 134, percentage: (134 / totalVisits) * 100 },
      { endpoint: 'auto-split-pdf', visits: 98, percentage: (98 / totalVisits) * 100 },
      { endpoint: 'scale-pages', visits: 76, percentage: (76 / totalVisits) * 100 },
      { endpoint: 'compare-pdfs', visits: 42, percentage: (42 / totalVisits) * 100 },
    ];

    let filteredEndpoints = allEndpoints;
    if (displayMode === 'top10') {
      filteredEndpoints = allEndpoints.slice(0, 10);
    } else if (displayMode === 'top20') {
      filteredEndpoints = allEndpoints.slice(0, 20);
    }

    return {
      totalVisits,
      totalEndpoints: filteredEndpoints.length,
      endpoints: filteredEndpoints,
    };
  }, [displayMode]);

  const fetchData = useCallback(async () => {
    if (!validateLoginEnabled()) {
      return;
    }

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
  }, [dataType, displayMode, validateLoginEnabled]);

  useEffect(() => {
    if (!showDemoData) {
      fetchData();
      return;
    }

    // Provide example usage analytics data when running in demo mode
    setError(null);
    setData(buildDemoUsageData());
    setLoading(false);
  }, [buildDemoUsageData, fetchData, showDemoData]);

  const handleRefresh = () => {
    if (!validateLoginEnabled()) {
      return;
    }
    if (showDemoData) {
      setData(buildDemoUsageData());
      return;
    }

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

  // Override loading state when showing demo data
  const actualLoading = showDemoData ? false : loading;

  // Early returns for loading/error states
  if (actualLoading) {
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

  const endpoints = data?.endpoints ?? [];
  const chartData = endpoints.map((e) => ({ label: e.endpoint, value: e.visits }));

  const displayedVisits = endpoints.reduce((sum, e) => sum + e.visits, 0);
  const totalVisits = data?.totalVisits ?? displayedVisits ?? 0;
  const totalEndpoints = data?.totalEndpoints ?? endpoints.length ?? 0;

  const displayedPercentage = totalVisits > 0
    ? ((displayedVisits / (totalVisits || 1)) * 100).toFixed(1)
    : '0';

  return (
    <Stack gap="lg">
      <LoginRequiredBanner show={!loginEnabled} />
      <EnterpriseRequiredBanner
        show={!runningEE}
        featureName={t('settings.licensingAnalytics.usageAnalytics', 'Usage Analytics')}
      />

      {/* Controls */}
      <Card padding="lg" radius="md" withBorder>
        <Stack gap="md">
          <Group justify="space-between" wrap="wrap">
            <Group>
              <SegmentedControl
                value={displayMode}
                onChange={(value) => setDisplayMode(value as 'top10' | 'top20' | 'all')}
                disabled={showDemoData}
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
                disabled={showDemoData}
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
              disabled={showDemoData}
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
                {totalEndpoints}
              </Text>
            </div>
            <div>
              <Text size="sm" c="dimmed">
                {t('usage.stats.totalVisits', 'Total Visits')}
              </Text>
              <Text size="lg" fw={600}>
                {totalVisits.toLocaleString()}
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
      <UsageAnalyticsChart data={chartData} />
      <UsageAnalyticsTable data={endpoints} />
    </Stack>
  );
};

export default AdminUsageSection;
