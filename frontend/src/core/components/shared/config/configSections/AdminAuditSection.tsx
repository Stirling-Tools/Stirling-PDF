import React, { useState, useEffect } from 'react';
import { Tabs, Loader, Alert, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import auditService, { AuditSystemStatus as AuditStatus } from '@app/services/auditService';
import AuditSystemStatus from '@app/components/shared/config/configSections/audit/AuditSystemStatus';
import AuditChartsSection from '@app/components/shared/config/configSections/audit/AuditChartsSection';
import AuditEventsTable from '@app/components/shared/config/configSections/audit/AuditEventsTable';
import AuditExportSection from '@app/components/shared/config/configSections/audit/AuditExportSection';

const AdminAuditSection: React.FC = () => {
  const { t } = useTranslation();
  const [systemStatus, setSystemStatus] = useState<AuditStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSystemStatus = async () => {
      try {
        setLoading(true);
        setError(null);
        const status = await auditService.getSystemStatus();
        setSystemStatus(status);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load audit system status');
      } finally {
        setLoading(false);
      }
    };

    fetchSystemStatus();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '2rem 0' }}>
        <Loader size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert color="red" title={t('audit.error.title', 'Error loading audit system')}>
        {error}
      </Alert>
    );
  }

  if (!systemStatus) {
    return (
      <Alert color="yellow" title={t('audit.notAvailable', 'Audit system not available')}>
        {t('audit.notAvailableMessage', 'The audit system is not configured or not available.')}
      </Alert>
    );
  }

  return (
    <Stack gap="lg">
      <AuditSystemStatus status={systemStatus} />

      {systemStatus.enabled ? (
        <Tabs defaultValue="dashboard">
          <Tabs.List>
            <Tabs.Tab value="dashboard">
              {t('audit.tabs.dashboard', 'Dashboard')}
            </Tabs.Tab>
            <Tabs.Tab value="events">
              {t('audit.tabs.events', 'Audit Events')}
            </Tabs.Tab>
            <Tabs.Tab value="export">
              {t('audit.tabs.export', 'Export')}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="dashboard" pt="md">
            <AuditChartsSection />
          </Tabs.Panel>

          <Tabs.Panel value="events" pt="md">
            <AuditEventsTable />
          </Tabs.Panel>

          <Tabs.Panel value="export" pt="md">
            <AuditExportSection />
          </Tabs.Panel>
        </Tabs>
      ) : (
        <Alert color="blue" title={t('audit.disabled', 'Audit logging is disabled')}>
          {t(
            'audit.disabledMessage',
            'Enable audit logging in your application configuration to track system events.'
          )}
        </Alert>
      )}
    </Stack>
  );
};

export default AdminAuditSection;
