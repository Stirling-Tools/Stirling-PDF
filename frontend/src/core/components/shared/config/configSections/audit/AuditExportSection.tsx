import React, { useState } from 'react';
import {
  Card,
  Text,
  Group,
  Stack,
  Select,
  Button,
  SegmentedControl,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useTranslation } from 'react-i18next';
import auditService, { AuditFilters } from '@app/services/auditService';
import LocalIcon from '@app/components/shared/LocalIcon';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';

interface AuditExportSectionProps {}

const AuditExportSection: React.FC<AuditExportSectionProps> = () => {
  const { t } = useTranslation();
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');
  const [exporting, setExporting] = useState(false);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [users, setUsers] = useState<string[]>([]);

  // Filters for export
  const [filters, setFilters] = useState<AuditFilters>({
    eventType: undefined,
    username: undefined,
    startDate: undefined,
    endDate: undefined,
  });

  React.useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [types, usersList] = await Promise.all([
          auditService.getEventTypes(),
          auditService.getUsers(),
        ]);
        setEventTypes(types);
        setUsers(usersList);
      } catch (err) {
        console.error('Failed to fetch metadata:', err);
      }
    };

    fetchMetadata();
  }, []);

  const handleExport = async () => {
    try {
      setExporting(true);

      const blob = await auditService.exportData(exportFormat, filters);

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-export-${new Date().toISOString()}.${exportFormat}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert(t('audit.export.error', 'Failed to export data'));
    } finally {
      setExporting(false);
    }
  };

  const handleFilterChange = (key: keyof AuditFilters, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleClearFilters = () => {
    setFilters({
      eventType: undefined,
      username: undefined,
      startDate: undefined,
      endDate: undefined,
    });
  };

  return (
    <Card padding="lg" radius="md" withBorder>
      <Stack gap="md">
        <Text size="lg" fw={600}>
          {t('audit.export.title', 'Export Audit Data')}
        </Text>

        <Text size="sm" c="dimmed">
          {t(
            'audit.export.description',
            'Export audit events to CSV or JSON format. Use filters to limit the exported data.'
          )}
        </Text>

        {/* Format Selection */}
        <div>
          <Text size="sm" fw={600} mb="xs">
            {t('audit.export.format', 'Export Format')}
          </Text>
          <SegmentedControl
            value={exportFormat}
            onChange={(value) => setExportFormat(value as 'csv' | 'json')}
            data={[
              { label: 'CSV', value: 'csv' },
              { label: 'JSON', value: 'json' },
            ]}
          />
        </div>

        {/* Filters */}
        <div>
          <Text size="sm" fw={600} mb="xs">
            {t('audit.export.filters', 'Filters (Optional)')}
          </Text>
          <Stack gap="sm">
            <Group>
              <Select
                placeholder={t('audit.export.filterByType', 'Filter by type')}
                data={eventTypes.map((type) => ({ value: type, label: type }))}
                value={filters.eventType}
                onChange={(value) => handleFilterChange('eventType', value || undefined)}
                clearable
                style={{ flex: 1, minWidth: 200 }}
                comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
              />
              <Select
                placeholder={t('audit.export.filterByUser', 'Filter by user')}
                data={users.map((user) => ({ value: user, label: user }))}
                value={filters.username}
                onChange={(value) => handleFilterChange('username', value || undefined)}
                clearable
                searchable
                style={{ flex: 1, minWidth: 200 }}
                comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
              />
            </Group>
            <Group>
              <DateInput
                placeholder={t('audit.export.startDate', 'Start date')}
                value={filters.startDate ? new Date(filters.startDate) : null}
                onChange={(value: string | null) =>
                  handleFilterChange('startDate', value ?? undefined)
                }
                clearable
                style={{ flex: 1, minWidth: 200 }}
                popoverProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
              />
              <DateInput
                placeholder={t('audit.export.endDate', 'End date')}
                value={filters.endDate ? new Date(filters.endDate) : null}
                onChange={(value: string | null) =>
                  handleFilterChange('endDate', value ?? undefined)
                }
                clearable
                style={{ flex: 1, minWidth: 200 }}
                popoverProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
              />
              <Button variant="outline" onClick={handleClearFilters}>
                {t('audit.export.clearFilters', 'Clear')}
              </Button>
            </Group>
          </Stack>
        </div>

        {/* Export Button */}
        <Group justify="flex-end">
          <Button
            leftSection={<LocalIcon icon="download" width="1rem" height="1rem" />}
            onClick={handleExport}
            loading={exporting}
            disabled={exporting}
          >
            {t('audit.export.exportButton', 'Export Data')}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
};

export default AuditExportSection;
