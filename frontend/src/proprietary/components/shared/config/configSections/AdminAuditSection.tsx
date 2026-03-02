import React, { useState, useEffect } from 'react';
import { Tabs, Loader, Alert, Stack, Text, Button, Accordion } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import auditService, { AuditSystemStatus as AuditStatus } from '@app/services/auditService';
import AuditSystemStatus from '@app/components/shared/config/configSections/audit/AuditSystemStatus';
import AuditStatsCards from '@app/components/shared/config/configSections/audit/AuditStatsCards';
import AuditChartsSection from '@app/components/shared/config/configSections/audit/AuditChartsSection';
import AuditEventsTable from '@app/components/shared/config/configSections/audit/AuditEventsTable';
import AuditExportSection from '@app/components/shared/config/configSections/audit/AuditExportSection';
import AuditClearDataSection from '@app/components/shared/config/configSections/audit/AuditClearDataSection';
import { useLoginRequired } from '@app/hooks/useLoginRequired';
import LoginRequiredBanner from '@app/components/shared/config/LoginRequiredBanner';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import EnterpriseRequiredBanner from '@app/components/shared/config/EnterpriseRequiredBanner';
import LocalIcon from '@app/components/shared/LocalIcon';

const AdminAuditSection: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { loginEnabled } = useLoginRequired();
  const { config } = useAppConfig();
  const licenseType = config?.license ?? 'NORMAL';
  const hasEnterpriseLicense = licenseType === 'ENTERPRISE';
  const showDemoData = !loginEnabled || !hasEnterpriseLicense;
  const [systemStatus, setSystemStatus] = useState<AuditStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timePeriod, setTimePeriod] = useState<'day' | 'week' | 'month'>('week');

  useEffect(() => {
    const fetchSystemStatus = async () => {
      try {
        setLoading(true);
        setError(null);
        const status = await auditService.getSystemStatus();
        setSystemStatus(status);
      } catch (err: any) {
        // Check if this is a permission/license error (403/404)
        const status = err?.response?.status;
        if (status === 403 || status === 404) {
          setError('enterprise-license-required');
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load audit system status');
        }
      } finally {
        setLoading(false);
      }
    };

    if (!showDemoData) {
      fetchSystemStatus();
    } else {
      // Provide example audit system status when running in demo mode
      setError(null);
      setSystemStatus({
        enabled: true,
        level: 'INFO',
        retentionDays: 90,
        totalEvents: 1234,
        pdfMetadataEnabled: true,
        captureFileHash: false,
        capturePdfAuthor: false,
        captureOperationResults: false,
      });
      setLoading(false);
    }
  }, [loginEnabled, showDemoData]);

  // Override loading state when showing demo data
  const actualLoading = showDemoData ? false : loading;

  if (actualLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '2rem 0' }}>
        <Loader size="lg" />
      </div>
    );
  }

  if (error) {
    if (error === 'enterprise-license-required') {
      return (
        <Alert color="blue" title={t('audit.enterpriseRequired', 'Enterprise License Required')}>
          {t(
            'audit.enterpriseRequiredMessage',
            'The audit logging system is an enterprise feature. Please upgrade to an enterprise license to access audit logs and analytics.'
          )}
        </Alert>
      );
    }
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

  const isEnabled = loginEnabled && hasEnterpriseLicense;

  return (
    <Stack gap="lg">
      <LoginRequiredBanner show={!loginEnabled} />
      <EnterpriseRequiredBanner
        show={!hasEnterpriseLicense}
        featureName={t('settings.licensingAnalytics.audit', 'Audit')}
      />

      {/* Info banner about audit settings */}
      {isEnabled && (
        <Alert
          icon={<LocalIcon icon="info" width="1.2rem" height="1.2rem" />}
          title={t('audit.configureAudit', 'Configure Audit Logging')}
          color="blue"
          variant="light"
        >
          <Stack gap="xs">
            <Text size="sm">
              {t(
                'audit.configureAuditMessage',
                'Adjust audit logging level, retention period, and other settings in the Security & Authentication section.'
              )}
            </Text>
            <Button
              variant="light"
              size="xs"
              onClick={() => navigate('/settings/adminSecurity#auditLogging')}
              rightSection={<LocalIcon icon="arrow-forward" width="0.9rem" height="0.9rem" />}
            >
              {t('audit.goToSettings', 'Go to Audit Settings')}
            </Button>
          </Stack>
        </Alert>
      )}

      <AuditSystemStatus status={systemStatus} />

      {systemStatus?.enabled ? (
        <Tabs defaultValue="dashboard">
          <Tabs.List>
            <Tabs.Tab value="dashboard" disabled={!isEnabled}>
              {t('audit.tabs.dashboard', 'Dashboard')}
            </Tabs.Tab>
            <Tabs.Tab value="events" disabled={!isEnabled}>
              {t('audit.tabs.events', 'Audit Events')}
            </Tabs.Tab>
            <Tabs.Tab value="export" disabled={!isEnabled}>
              {t('audit.tabs.export', 'Export')}
            </Tabs.Tab>
            <Tabs.Tab value="clearData" disabled={!isEnabled}>
              {t('audit.tabs.clearData', 'Clear Data')}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="dashboard" pt="md">
            <Stack gap="lg">
              {/* Stats Cards - Always Visible */}
              <AuditStatsCards loginEnabled={isEnabled} timePeriod={timePeriod} />

              {/* Charts in Accordion - Collapsible */}
              <Accordion defaultValue={["events-over-time"]} multiple>
                <Accordion.Item value="events-over-time">
                  <Accordion.Control>
                    {t('audit.charts.overTime', 'Events Over Time')}
                  </Accordion.Control>
                  <Accordion.Panel>
                    <AuditChartsSection
                      loginEnabled={isEnabled}
                      timePeriod={timePeriod}
                      onTimePeriodChange={setTimePeriod}
                    />
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="events" pt="md">
            <AuditEventsTable loginEnabled={isEnabled} pdfMetadataEnabled={systemStatus?.pdfMetadataEnabled} />
          </Tabs.Panel>

          <Tabs.Panel value="export" pt="md">
            <AuditExportSection
              loginEnabled={isEnabled}
              captureFileHash={systemStatus?.captureFileHash}
              capturePdfAuthor={systemStatus?.capturePdfAuthor}
              captureOperationResults={systemStatus?.captureOperationResults}
            />
          </Tabs.Panel>

          <Tabs.Panel value="clearData" pt="md">
            <AuditClearDataSection loginEnabled={isEnabled} />
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
