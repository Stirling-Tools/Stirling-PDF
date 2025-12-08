import React from 'react';
import { Group, Select, Button } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useTranslation } from 'react-i18next';
import { AuditFilters } from '@app/services/auditService';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';

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

  return (
    <Group>
      <Select
        placeholder={t('audit.events.filterByType', 'Filter by type')}
        data={eventTypes.map((type) => ({ value: type, label: type }))}
        value={filters.eventType}
        onChange={(value) => onFilterChange('eventType', value || undefined)}
        clearable
        disabled={disabled}
        style={{ flex: 1, minWidth: 200 }}
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
        style={{ flex: 1, minWidth: 200 }}
        comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
      />
      <DateInput
        placeholder={t('audit.events.startDate', 'Start date')}
        value={filters.startDate ? new Date(filters.startDate) : null}
        onChange={(value: string | null) =>
          onFilterChange('startDate', value ?? undefined)
        }
        clearable
        disabled={disabled}
        style={{ flex: 1, minWidth: 150 }}
        popoverProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
      />
      <DateInput
        placeholder={t('audit.events.endDate', 'End date')}
        value={filters.endDate ? new Date(filters.endDate) : null}
        onChange={(value: string | null) =>
          onFilterChange('endDate', value ?? undefined)
        }
        clearable
        disabled={disabled}
        style={{ flex: 1, minWidth: 150 }}
        popoverProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
      />
      <Button variant="outline" onClick={onClearFilters} disabled={disabled}>
        {t('audit.events.clearFilters', 'Clear')}
      </Button>
    </Group>
  );
};

export default AuditFiltersForm;
