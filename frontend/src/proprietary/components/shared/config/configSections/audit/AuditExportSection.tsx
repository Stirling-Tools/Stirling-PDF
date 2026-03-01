import React, { useState } from 'react';
import {
  Card,
  Text,
  Group,
  Stack,
  Button,
  SegmentedControl,
  Checkbox,
  Tooltip,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import auditService from '@app/services/auditService';
import LocalIcon from '@app/components/shared/LocalIcon';
import { useAuditFilters } from '@app/hooks/useAuditFilters';
import AuditFiltersForm from '@app/components/shared/config/configSections/audit/AuditFiltersForm';

interface AuditExportSectionProps {
  loginEnabled?: boolean;
  pdfMetadataEnabled?: boolean;
}

const AuditExportSection: React.FC<AuditExportSectionProps> = ({ loginEnabled = true, pdfMetadataEnabled = false }) => {
  const { t } = useTranslation();
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');
  const [exporting, setExporting] = useState(false);
  const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>({
    date: true,
    username: true,
    ipaddress: true,
    tool: true,
    documentName: true,
    outcome: false,
    author: pdfMetadataEnabled,
    fileHash: pdfMetadataEnabled,
  });

  // Use shared filters hook
  const { filters, eventTypes, users, handleFilterChange, handleClearFilters } = useAuditFilters({}, loginEnabled);

  const handleExport = async () => {
    if (!loginEnabled) return;

    try {
      setExporting(true);

      const fieldsParam = exportFormat === 'csv'
        ? Object.keys(selectedFields).filter(k => selectedFields[k as keyof typeof selectedFields]).join(',')
        : undefined;

      const blob = await auditService.exportData(exportFormat, { ...filters, fields: fieldsParam });

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
            onChange={(value) => {
              if (!loginEnabled) return;
              setExportFormat(value as 'csv' | 'json');
            }}
            disabled={!loginEnabled}
            data={[
              { label: 'CSV', value: 'csv' },
              { label: 'JSON', value: 'json' },
            ]}
          />
        </div>

        {/* CSV Field Selection */}
        {exportFormat === 'csv' && (
          <div>
            <Text size="sm" fw={600} mb="xs">
              {t('audit.export.selectFields', 'Select Fields to Include')}
            </Text>
            <Stack gap="xs">
              <Checkbox
                label={t('audit.export.fieldDate', 'Date')}
                checked={selectedFields.date}
                onChange={(e) => setSelectedFields({ ...selectedFields, date: e.currentTarget.checked })}
                disabled={!loginEnabled}
              />
              <Checkbox
                label={t('audit.export.fieldUsername', 'Username')}
                checked={selectedFields.username}
                onChange={(e) => setSelectedFields({ ...selectedFields, username: e.currentTarget.checked })}
                disabled={!loginEnabled}
              />
              <Checkbox
                label={t('audit.export.fieldIpAddress', 'IP Address')}
                checked={selectedFields.ipaddress}
                onChange={(e) => setSelectedFields({ ...selectedFields, ipaddress: e.currentTarget.checked })}
                disabled={!loginEnabled}
              />
              <Checkbox
                label={t('audit.export.fieldTool', 'Tool')}
                checked={selectedFields.tool}
                onChange={(e) => setSelectedFields({ ...selectedFields, tool: e.currentTarget.checked })}
                disabled={!loginEnabled}
              />
              <Checkbox
                label={t('audit.export.fieldDocumentName', 'Document Name')}
                checked={selectedFields.documentName}
                onChange={(e) => setSelectedFields({ ...selectedFields, documentName: e.currentTarget.checked })}
                disabled={!loginEnabled}
              />
              <Checkbox
                label={t('audit.export.fieldOutcome', 'Outcome (Success/Failure)')}
                checked={selectedFields.outcome}
                onChange={(e) => setSelectedFields({ ...selectedFields, outcome: e.currentTarget.checked })}
                disabled={!loginEnabled}
              />
              <Tooltip
                label={pdfMetadataEnabled ? '' : t('audit.export.verboseRequired', 'Requires VERBOSE audit level')}
                disabled={pdfMetadataEnabled}
              >
                <Checkbox
                  label={t('audit.export.fieldAuthor', 'Author (from PDF)')}
                  checked={selectedFields.author}
                  onChange={(e) => setSelectedFields({ ...selectedFields, author: e.currentTarget.checked })}
                  disabled={!loginEnabled || !pdfMetadataEnabled}
                  opacity={pdfMetadataEnabled ? 1 : 0.5}
                />
              </Tooltip>
              <Tooltip
                label={pdfMetadataEnabled ? '' : t('audit.export.verboseRequired', 'Requires VERBOSE audit level')}
                disabled={pdfMetadataEnabled}
              >
                <Checkbox
                  label={t('audit.export.fieldFileHash', 'File Hash (SHA-256)')}
                  checked={selectedFields.fileHash}
                  onChange={(e) => setSelectedFields({ ...selectedFields, fileHash: e.currentTarget.checked })}
                  disabled={!loginEnabled || !pdfMetadataEnabled}
                  opacity={pdfMetadataEnabled ? 1 : 0.5}
                />
              </Tooltip>
            </Stack>
          </div>
        )}

        {/* Filters */}
        <div>
          <Text size="sm" fw={600} mb="xs">
            {t('audit.export.filters', 'Filters (Optional)')}
          </Text>
          <AuditFiltersForm
            filters={filters}
            eventTypes={eventTypes}
            users={users}
            onFilterChange={handleFilterChange}
            onClearFilters={handleClearFilters}
            disabled={!loginEnabled}
          />
        </div>

        {/* Export Button */}
        <Group justify="flex-end">
          <Button
            leftSection={<LocalIcon icon="download" width="1rem" height="1rem" />}
            onClick={handleExport}
            loading={exporting}
            disabled={!loginEnabled || exporting}
          >
            {t('audit.export.exportButton', 'Export Data')}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
};

export default AuditExportSection;
