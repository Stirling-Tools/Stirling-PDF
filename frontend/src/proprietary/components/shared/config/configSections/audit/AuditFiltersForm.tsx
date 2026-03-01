import React from 'react';
import { Group, Select, Button, Stack, SimpleGrid, Text } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useTranslation } from 'react-i18next';
import { AuditFilters } from '@app/services/auditService';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';

// Helper to format date as YYYY-MM-DD in local time (avoids DST/UTC issues)
const formatDateToYMD = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper to calculate date range for quick presets
const getDateRange = (preset: string): [Date, Date] | null => {
  const end = new Date();
  const start = new Date();

  switch (preset) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return [start, end];
    case 'last7':
      start.setDate(start.getDate() - 7);
      return [start, end];
    case 'last30':
      start.setDate(start.getDate() - 30);
      return [start, end];
    case 'thisMonth':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return [start, end];
    default:
      return null;
  }
};

interface AuditFiltersFormProps {
  filters: AuditFilters;
  eventTypes: string[];
  users: string[];
  onFilterChange: (key: keyof AuditFilters, value: any) => void;
  onClearFilters: () => void;
  disabled?: boolean;
}

/**
 * Shared filter form for audit components
 */
const AuditFiltersForm: React.FC<AuditFiltersFormProps> = ({
  filters,
  eventTypes,
  users,
  onFilterChange,
  onClearFilters,
  disabled = false,
}) => {
  const { t } = useTranslation();

  const handleQuickPreset = (preset: string) => {
    const range = getDateRange(preset);
    if (range) {
      const [start, end] = range;
      onFilterChange('startDate', formatDateToYMD(start));
      onFilterChange('endDate', formatDateToYMD(end));
    }
  };

  const isPresetActive = (preset: string): boolean => {
    if (!filters.startDate || !filters.endDate) return false;
    const range = getDateRange(preset);
    if (!range) return false;
    const [expectedStart, expectedEnd] = range;
    const expectedStartStr = formatDateToYMD(expectedStart);
    const expectedEndStr = formatDateToYMD(expectedEnd);
    return filters.startDate === expectedStartStr && filters.endDate === expectedEndStr;
  };

  return (
    <Stack gap="md">
      {/* Quick Preset Buttons */}
      <div>
        <Text size="xs" fw={600} mb="xs" c="dimmed">
          {t('audit.filters.quickPresets', 'Quick filters')}
        </Text>
        <Group gap="xs">
          <Button
            variant={isPresetActive('today') ? 'filled' : 'light'}
            size="xs"
            onClick={() => handleQuickPreset('today')}
            disabled={disabled}
          >
            {t('audit.filters.today', 'Today')}
          </Button>
          <Button
            variant={isPresetActive('last7') ? 'filled' : 'light'}
            size="xs"
            onClick={() => handleQuickPreset('last7')}
            disabled={disabled}
          >
            {t('audit.filters.last7Days', 'Last 7 days')}
          </Button>
          <Button
            variant={isPresetActive('last30') ? 'filled' : 'light'}
            size="xs"
            onClick={() => handleQuickPreset('last30')}
            disabled={disabled}
          >
            {t('audit.filters.last30Days', 'Last 30 days')}
          </Button>
          <Button
            variant={isPresetActive('thisMonth') ? 'filled' : 'light'}
            size="xs"
            onClick={() => handleQuickPreset('thisMonth')}
            disabled={disabled}
          >
            {t('audit.filters.thisMonth', 'This month')}
          </Button>
        </Group>
      </div>

      {/* Filter Inputs */}
      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="sm">
        <Select
          placeholder={t('audit.events.filterByType', 'Filter by type')}
          data={eventTypes.map((type) => ({ value: type, label: type }))}
          value={filters.eventType}
          onChange={(value) => onFilterChange('eventType', value || undefined)}
          clearable
          disabled={disabled}
          comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
        />
        <Select
          placeholder={t('audit.events.filterByUser', 'Filter by user')}
          data={users.map((user) => ({ value: user, label: user }))}
          value={filters.username}
          onChange={(value) => onFilterChange('username', value || undefined)}
          clearable
          searchable
          disabled={disabled}
          comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
        />
        <DateInput
          placeholder={t('audit.events.startDate', 'Start date')}
          value={filters.startDate ? new Date(filters.startDate) : null}
          onChange={(value: any) => {
            onFilterChange('startDate', value ? formatDateToYMD(value as Date) : undefined);
          }}
          clearable
          disabled={disabled}
          popoverProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
        />
        <DateInput
          placeholder={t('audit.events.endDate', 'End date')}
          value={filters.endDate ? new Date(filters.endDate) : null}
          onChange={(value: any) => {
            onFilterChange('endDate', value ? formatDateToYMD(value as Date) : undefined);
          }}
          clearable
          disabled={disabled}
          popoverProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
        />
      </SimpleGrid>

      {/* Clear Button */}
      <Group justify="flex-end">
        <Button variant="outline" size="sm" onClick={onClearFilters} disabled={disabled}>
          {t('audit.events.clearFilters', 'Clear')}
        </Button>
      </Group>
    </Stack>
  );
};

export default AuditFiltersForm;
