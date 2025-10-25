import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NumberInput, Switch, Button, Stack, Paper, Text, Loader, Group, Accordion, TextInput } from '@mantine/core';
import { alert } from '../../../toast';
import RestartConfirmationModal from '../RestartConfirmationModal';
import { useRestartServer } from '../useRestartServer';
import { useAdminSettings } from '../../../../hooks/useAdminSettings';
import PendingBadge from '../PendingBadge';
import apiClient from '../../../../services/apiClient';

interface AdvancedSettingsData {
  enableAlphaFunctionality?: boolean;
  maxDPI?: number;
  enableUrlToPDF?: boolean;
  tessdataDir?: string;
  disableSanitize?: boolean;
  tempFileManagement?: {
    baseTmpDir?: string;
    libreofficeDir?: string;
    systemTempDir?: string;
    prefix?: string;
    maxAgeHours?: number;
    cleanupIntervalMinutes?: number;
    startupCleanup?: boolean;
    cleanupSystemTemp?: boolean;
  };
  processExecutor?: {
    sessionLimit?: {
      libreOfficeSessionLimit?: number;
      pdfToHtmlSessionLimit?: number;
      qpdfSessionLimit?: number;
      tesseractSessionLimit?: number;
      pythonOpenCvSessionLimit?: number;
      weasyPrintSessionLimit?: number;
      installAppSessionLimit?: number;
      calibreSessionLimit?: number;
      ghostscriptSessionLimit?: number;
      ocrMyPdfSessionLimit?: number;
    };
    timeoutMinutes?: {
      libreOfficetimeoutMinutes?: number;
      pdfToHtmltimeoutMinutes?: number;
      pythonOpenCvtimeoutMinutes?: number;
      weasyPrinttimeoutMinutes?: number;
      installApptimeoutMinutes?: number;
      calibretimeoutMinutes?: number;
      tesseractTimeoutMinutes?: number;
      qpdfTimeoutMinutes?: number;
      ghostscriptTimeoutMinutes?: number;
      ocrMyPdfTimeoutMinutes?: number;
    };
  };
}

export default function AdminAdvancedSection() {
  const { t } = useTranslation();
  const { restartModalOpened, showRestartModal, closeRestartModal, restartServer } = useRestartServer();

  const {
    settings,
    setSettings,
    loading,
    saving,
    fetchSettings,
    saveSettings,
    isFieldPending,
  } = useAdminSettings<AdvancedSettingsData>({
    sectionName: 'advanced',
    fetchTransformer: async () => {
      const [systemResponse, processExecutorResponse] = await Promise.all([
        apiClient.get('/api/v1/admin/settings/section/system'),
        apiClient.get('/api/v1/admin/settings/section/processExecutor')
      ]);

      const systemData = systemResponse.data || {};
      const processExecutorData = processExecutorResponse.data || {};

      const result: any = {
        enableAlphaFunctionality: systemData.enableAlphaFunctionality || false,
        maxDPI: systemData.maxDPI || 0,
        enableUrlToPDF: systemData.enableUrlToPDF || false,
        tessdataDir: systemData.tessdataDir || '',
        disableSanitize: systemData.disableSanitize || false,
        tempFileManagement: systemData.tempFileManagement || {
          baseTmpDir: '',
          libreofficeDir: '',
          systemTempDir: '',
          prefix: 'stirling-pdf-',
          maxAgeHours: 24,
          cleanupIntervalMinutes: 30,
          startupCleanup: true,
          cleanupSystemTemp: false
        },
        processExecutor: processExecutorData || {}
      };

      // Merge pending blocks from both endpoints
      const pendingBlock: any = {};
      if (systemData._pending?.enableAlphaFunctionality !== undefined) {
        pendingBlock.enableAlphaFunctionality = systemData._pending.enableAlphaFunctionality;
      }
      if (systemData._pending?.maxDPI !== undefined) {
        pendingBlock.maxDPI = systemData._pending.maxDPI;
      }
      if (systemData._pending?.enableUrlToPDF !== undefined) {
        pendingBlock.enableUrlToPDF = systemData._pending.enableUrlToPDF;
      }
      if (systemData._pending?.tessdataDir !== undefined) {
        pendingBlock.tessdataDir = systemData._pending.tessdataDir;
      }
      if (systemData._pending?.disableSanitize !== undefined) {
        pendingBlock.disableSanitize = systemData._pending.disableSanitize;
      }
      if (systemData._pending?.tempFileManagement) {
        pendingBlock.tempFileManagement = systemData._pending.tempFileManagement;
      }
      if (processExecutorData._pending) {
        pendingBlock.processExecutor = processExecutorData._pending;
      }

      if (Object.keys(pendingBlock).length > 0) {
        result._pending = pendingBlock;
      }

      return result;
    },
    saveTransformer: (settings) => {
      const deltaSettings: Record<string, any> = {
        'system.enableAlphaFunctionality': settings.enableAlphaFunctionality,
        'system.maxDPI': settings.maxDPI,
        'system.enableUrlToPDF': settings.enableUrlToPDF,
        'system.tessdataDir': settings.tessdataDir,
        'system.disableSanitize': settings.disableSanitize
      };

      // Add temp file management settings
      if (settings.tempFileManagement) {
        deltaSettings['system.tempFileManagement.baseTmpDir'] = settings.tempFileManagement.baseTmpDir;
        deltaSettings['system.tempFileManagement.libreofficeDir'] = settings.tempFileManagement.libreofficeDir;
        deltaSettings['system.tempFileManagement.systemTempDir'] = settings.tempFileManagement.systemTempDir;
        deltaSettings['system.tempFileManagement.prefix'] = settings.tempFileManagement.prefix;
        deltaSettings['system.tempFileManagement.maxAgeHours'] = settings.tempFileManagement.maxAgeHours;
        deltaSettings['system.tempFileManagement.cleanupIntervalMinutes'] = settings.tempFileManagement.cleanupIntervalMinutes;
        deltaSettings['system.tempFileManagement.startupCleanup'] = settings.tempFileManagement.startupCleanup;
        deltaSettings['system.tempFileManagement.cleanupSystemTemp'] = settings.tempFileManagement.cleanupSystemTemp;
      }

      // Add process executor settings
      if (settings.processExecutor?.sessionLimit) {
        Object.entries(settings.processExecutor.sessionLimit).forEach(([key, value]) => {
          deltaSettings[`processExecutor.sessionLimit.${key}`] = value;
        });
      }
      if (settings.processExecutor?.timeoutMinutes) {
        Object.entries(settings.processExecutor.timeoutMinutes).forEach(([key, value]) => {
          deltaSettings[`processExecutor.timeoutMinutes.${key}`] = value;
        });
      }

      return {
        sectionData: {},
        deltaSettings
      };
    }
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async () => {
    try {
      await saveSettings();
      showRestartModal();
    } catch (_error) {
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t('admin.settings.saveError', 'Failed to save settings'),
      });
    }
  };

  if (loading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <div>
        <Text fw={600} size="lg">{t('admin.settings.advanced.title', 'Advanced')}</Text>
        <Text size="sm" c="dimmed">
          {t('admin.settings.advanced.description', 'Configure advanced features and experimental functionality.')}
        </Text>
      </div>

      {/* Feature Flags */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Text fw={600} size="sm" mb="xs">{t('admin.settings.advanced.features', 'Feature Flags')}</Text>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.advanced.enableAlphaFunctionality', 'Enable Alpha Features')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.advanced.enableAlphaFunctionality.description', 'Enable experimental and alpha-stage features (may be unstable)')}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings.enableAlphaFunctionality || false}
                onChange={(e) => setSettings({ ...settings, enableAlphaFunctionality: e.target.checked })}
              />
              <PendingBadge show={isFieldPending('enableAlphaFunctionality')} />
            </Group>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.advanced.enableUrlToPDF', 'Enable URL to PDF')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.advanced.enableUrlToPDF.description', 'Allow conversion of web pages to PDF documents (internal use only)')}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings.enableUrlToPDF || false}
                onChange={(e) => setSettings({ ...settings, enableUrlToPDF: e.target.checked })}
              />
              <PendingBadge show={isFieldPending('enableUrlToPDF')} />
            </Group>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.advanced.disableSanitize', 'Disable HTML Sanitization')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.advanced.disableSanitize.description', 'Disable HTML sanitization (WARNING: Security risk - can lead to XSS injections)')}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings.disableSanitize || false}
                onChange={(e) => setSettings({ ...settings, disableSanitize: e.target.checked })}
              />
              <PendingBadge show={isFieldPending('disableSanitize')} />
            </Group>
          </div>
        </Stack>
      </Paper>

      {/* Processing Settings */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Text fw={600} size="sm" mb="xs">{t('admin.settings.advanced.processing', 'Processing')}</Text>

          <div>
            <NumberInput
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.advanced.maxDPI', 'Maximum DPI')}</span>
                  <PendingBadge show={isFieldPending('maxDPI')} />
                </Group>
              }
              description={t('admin.settings.advanced.maxDPI.description', 'Maximum DPI for image processing (0 = unlimited)')}
              value={settings.maxDPI || 0}
              onChange={(value) => setSettings({ ...settings, maxDPI: Number(value) })}
              min={0}
              max={3000}
            />
          </div>

          <div>
            <TextInput
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.advanced.tessdataDir', 'Tessdata Directory')}</span>
                  <PendingBadge show={isFieldPending('tessdataDir')} />
                </Group>
              }
              description={t('admin.settings.advanced.tessdataDir.description', 'Path to the directory containing Tessdata files for OCR')}
              value={settings.tessdataDir || ''}
              onChange={(e) => setSettings({ ...settings, tessdataDir: e.target.value })}
              placeholder="/usr/share/tessdata"
            />
          </div>
        </Stack>
      </Paper>

      {/* Temp File Management */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <div>
            <Text fw={600} size="sm" mb="xs">{t('admin.settings.advanced.tempFileManagement', 'Temp File Management')}</Text>
            <Text size="xs" c="dimmed">
              {t('admin.settings.advanced.tempFileManagement.description', 'Configure temporary file storage and cleanup behavior')}
            </Text>
          </div>

          <div>
            <TextInput
              label={t('admin.settings.advanced.tempFileManagement.baseTmpDir', 'Base Temp Directory')}
              description={t('admin.settings.advanced.tempFileManagement.baseTmpDir.description', 'Base directory for temporary files (leave empty for default: java.io.tmpdir/stirling-pdf)')}
              value={settings.tempFileManagement?.baseTmpDir || ''}
              onChange={(e) => setSettings({
                ...settings,
                tempFileManagement: { ...settings.tempFileManagement, baseTmpDir: e.target.value }
              })}
              placeholder="Default: java.io.tmpdir/stirling-pdf"
            />
          </div>

          <div>
            <TextInput
              label={t('admin.settings.advanced.tempFileManagement.libreofficeDir', 'LibreOffice Temp Directory')}
              description={t('admin.settings.advanced.tempFileManagement.libreofficeDir.description', 'Directory for LibreOffice temp files (leave empty for default: baseTmpDir/libreoffice)')}
              value={settings.tempFileManagement?.libreofficeDir || ''}
              onChange={(e) => setSettings({
                ...settings,
                tempFileManagement: { ...settings.tempFileManagement, libreofficeDir: e.target.value }
              })}
              placeholder="Default: baseTmpDir/libreoffice"
            />
          </div>

          <div>
            <TextInput
              label={t('admin.settings.advanced.tempFileManagement.systemTempDir', 'System Temp Directory')}
              description={t('admin.settings.advanced.tempFileManagement.systemTempDir.description', 'System temp directory to clean (only used if cleanupSystemTemp is enabled)')}
              value={settings.tempFileManagement?.systemTempDir || ''}
              onChange={(e) => setSettings({
                ...settings,
                tempFileManagement: { ...settings.tempFileManagement, systemTempDir: e.target.value }
              })}
              placeholder="System temp directory path"
            />
          </div>

          <div>
            <TextInput
              label={t('admin.settings.advanced.tempFileManagement.prefix', 'Temp File Prefix')}
              description={t('admin.settings.advanced.tempFileManagement.prefix.description', 'Prefix for temp file names')}
              value={settings.tempFileManagement?.prefix || 'stirling-pdf-'}
              onChange={(e) => setSettings({
                ...settings,
                tempFileManagement: { ...settings.tempFileManagement, prefix: e.target.value }
              })}
              placeholder="stirling-pdf-"
            />
          </div>

          <div>
            <NumberInput
              label={t('admin.settings.advanced.tempFileManagement.maxAgeHours', 'Max Age (hours)')}
              description={t('admin.settings.advanced.tempFileManagement.maxAgeHours.description', 'Maximum age in hours before temp files are cleaned up')}
              value={settings.tempFileManagement?.maxAgeHours ?? 24}
              onChange={(value) => setSettings({
                ...settings,
                tempFileManagement: { ...settings.tempFileManagement, maxAgeHours: Number(value) }
              })}
              min={1}
              max={720}
            />
          </div>

          <div>
            <NumberInput
              label={t('admin.settings.advanced.tempFileManagement.cleanupIntervalMinutes', 'Cleanup Interval (minutes)')}
              description={t('admin.settings.advanced.tempFileManagement.cleanupIntervalMinutes.description', 'How often to run cleanup (in minutes)')}
              value={settings.tempFileManagement?.cleanupIntervalMinutes ?? 30}
              onChange={(value) => setSettings({
                ...settings,
                tempFileManagement: { ...settings.tempFileManagement, cleanupIntervalMinutes: Number(value) }
              })}
              min={1}
              max={1440}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.advanced.tempFileManagement.startupCleanup', 'Startup Cleanup')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.advanced.tempFileManagement.startupCleanup.description', 'Clean up old temp files on application startup')}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings.tempFileManagement?.startupCleanup ?? true}
                onChange={(e) => setSettings({
                  ...settings,
                  tempFileManagement: { ...settings.tempFileManagement, startupCleanup: e.target.checked }
                })}
              />
              <PendingBadge show={isFieldPending('tempFileManagement.startupCleanup')} />
            </Group>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.advanced.tempFileManagement.cleanupSystemTemp', 'Cleanup System Temp')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.advanced.tempFileManagement.cleanupSystemTemp.description', 'Whether to clean broader system temp directory (use with caution)')}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings.tempFileManagement?.cleanupSystemTemp ?? false}
                onChange={(e) => setSettings({
                  ...settings,
                  tempFileManagement: { ...settings.tempFileManagement, cleanupSystemTemp: e.target.checked }
                })}
              />
              <PendingBadge show={isFieldPending('tempFileManagement.cleanupSystemTemp')} />
            </Group>
          </div>
        </Stack>
      </Paper>

      {/* Process Executor Limits */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Text fw={600} size="sm">{t('admin.settings.advanced.processExecutor', 'Process Executor Limits')}</Text>
          <Text size="xs" c="dimmed">
            {t('admin.settings.advanced.processExecutor.description', 'Configure session limits and timeouts for each process executor')}
          </Text>

          <Accordion variant="separated">
            {/* LibreOffice */}
            <Accordion.Item value="libreOffice">
              <Accordion.Control>{t('admin.settings.advanced.processExecutor.libreOffice', 'LibreOffice')}</Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  <NumberInput
                    label={t('admin.settings.advanced.processExecutor.sessionLimit', 'Session Limit')}
                    description={t('admin.settings.advanced.processExecutor.sessionLimit.description', 'Maximum concurrent instances')}
                    value={settings.processExecutor?.sessionLimit?.libreOfficeSessionLimit ?? 1}
                    onChange={(value) => setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        sessionLimit: { ...settings.processExecutor?.sessionLimit, libreOfficeSessionLimit: Number(value) }
                      }
                    })}
                    min={1}
                    max={100}
                  />
                  <NumberInput
                    label={t('admin.settings.advanced.processExecutor.timeout', 'Timeout (minutes)')}
                    description={t('admin.settings.advanced.processExecutor.timeout.description', 'Maximum execution time')}
                    value={settings.processExecutor?.timeoutMinutes?.libreOfficetimeoutMinutes ?? 30}
                    onChange={(value) => setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        timeoutMinutes: { ...settings.processExecutor?.timeoutMinutes, libreOfficetimeoutMinutes: Number(value) }
                      }
                    })}
                    min={1}
                    max={240}
                  />
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            {/* PDF to HTML */}
            <Accordion.Item value="pdfToHtml">
              <Accordion.Control>{t('admin.settings.advanced.processExecutor.pdfToHtml', 'PDF to HTML')}</Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  <NumberInput
                    label={t('admin.settings.advanced.processExecutor.sessionLimit', 'Session Limit')}
                    description={t('admin.settings.advanced.processExecutor.sessionLimit.description', 'Maximum concurrent instances')}
                    value={settings.processExecutor?.sessionLimit?.pdfToHtmlSessionLimit ?? 1}
                    onChange={(value) => setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        sessionLimit: { ...settings.processExecutor?.sessionLimit, pdfToHtmlSessionLimit: Number(value) }
                      }
                    })}
                    min={1}
                    max={100}
                  />
                  <NumberInput
                    label={t('admin.settings.advanced.processExecutor.timeout', 'Timeout (minutes)')}
                    description={t('admin.settings.advanced.processExecutor.timeout.description', 'Maximum execution time')}
                    value={settings.processExecutor?.timeoutMinutes?.pdfToHtmltimeoutMinutes ?? 20}
                    onChange={(value) => setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        timeoutMinutes: { ...settings.processExecutor?.timeoutMinutes, pdfToHtmltimeoutMinutes: Number(value) }
                      }
                    })}
                    min={1}
                    max={240}
                  />
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            {/* QPDF */}
            <Accordion.Item value="qpdf">
              <Accordion.Control>{t('admin.settings.advanced.processExecutor.qpdf', 'QPDF')}</Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  <NumberInput
                    label={t('admin.settings.advanced.processExecutor.sessionLimit', 'Session Limit')}
                    description={t('admin.settings.advanced.processExecutor.sessionLimit.description', 'Maximum concurrent instances')}
                    value={settings.processExecutor?.sessionLimit?.qpdfSessionLimit ?? 4}
                    onChange={(value) => setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        sessionLimit: { ...settings.processExecutor?.sessionLimit, qpdfSessionLimit: Number(value) }
                      }
                    })}
                    min={1}
                    max={100}
                  />
                  <NumberInput
                    label={t('admin.settings.advanced.processExecutor.timeout', 'Timeout (minutes)')}
                    description={t('admin.settings.advanced.processExecutor.timeout.description', 'Maximum execution time')}
                    value={settings.processExecutor?.timeoutMinutes?.qpdfTimeoutMinutes ?? 30}
                    onChange={(value) => setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        timeoutMinutes: { ...settings.processExecutor?.timeoutMinutes, qpdfTimeoutMinutes: Number(value) }
                      }
                    })}
                    min={1}
                    max={240}
                  />
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            {/* Tesseract OCR */}
            <Accordion.Item value="tesseract">
              <Accordion.Control>{t('admin.settings.advanced.processExecutor.tesseract', 'Tesseract OCR')}</Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  <NumberInput
                    label={t('admin.settings.advanced.processExecutor.sessionLimit', 'Session Limit')}
                    description={t('admin.settings.advanced.processExecutor.sessionLimit.description', 'Maximum concurrent instances')}
                    value={settings.processExecutor?.sessionLimit?.tesseractSessionLimit ?? 1}
                    onChange={(value) => setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        sessionLimit: { ...settings.processExecutor?.sessionLimit, tesseractSessionLimit: Number(value) }
                      }
                    })}
                    min={1}
                    max={100}
                  />
                  <NumberInput
                    label={t('admin.settings.advanced.processExecutor.timeout', 'Timeout (minutes)')}
                    description={t('admin.settings.advanced.processExecutor.timeout.description', 'Maximum execution time')}
                    value={settings.processExecutor?.timeoutMinutes?.tesseractTimeoutMinutes ?? 30}
                    onChange={(value) => setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        timeoutMinutes: { ...settings.processExecutor?.timeoutMinutes, tesseractTimeoutMinutes: Number(value) }
                      }
                    })}
                    min={1}
                    max={240}
                  />
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            {/* Python OpenCV */}
            <Accordion.Item value="pythonOpenCv">
              <Accordion.Control>{t('admin.settings.advanced.processExecutor.pythonOpenCv', 'Python OpenCV')}</Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  <NumberInput
                    label={t('admin.settings.advanced.processExecutor.sessionLimit', 'Session Limit')}
                    description={t('admin.settings.advanced.processExecutor.sessionLimit.description', 'Maximum concurrent instances')}
                    value={settings.processExecutor?.sessionLimit?.pythonOpenCvSessionLimit ?? 8}
                    onChange={(value) => setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        sessionLimit: { ...settings.processExecutor?.sessionLimit, pythonOpenCvSessionLimit: Number(value) }
                      }
                    })}
                    min={1}
                    max={100}
                  />
                  <NumberInput
                    label={t('admin.settings.advanced.processExecutor.timeout', 'Timeout (minutes)')}
                    description={t('admin.settings.advanced.processExecutor.timeout.description', 'Maximum execution time')}
                    value={settings.processExecutor?.timeoutMinutes?.pythonOpenCvtimeoutMinutes ?? 30}
                    onChange={(value) => setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        timeoutMinutes: { ...settings.processExecutor?.timeoutMinutes, pythonOpenCvtimeoutMinutes: Number(value) }
                      }
                    })}
                    min={1}
                    max={240}
                  />
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            {/* WeasyPrint */}
            <Accordion.Item value="weasyPrint">
              <Accordion.Control>{t('admin.settings.advanced.processExecutor.weasyPrint', 'WeasyPrint')}</Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  <NumberInput
                    label={t('admin.settings.advanced.processExecutor.sessionLimit', 'Session Limit')}
                    description={t('admin.settings.advanced.processExecutor.sessionLimit.description', 'Maximum concurrent instances')}
                    value={settings.processExecutor?.sessionLimit?.weasyPrintSessionLimit ?? 16}
                    onChange={(value) => setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        sessionLimit: { ...settings.processExecutor?.sessionLimit, weasyPrintSessionLimit: Number(value) }
                      }
                    })}
                    min={1}
                    max={100}
                  />
                  <NumberInput
                    label={t('admin.settings.advanced.processExecutor.timeout', 'Timeout (minutes)')}
                    description={t('admin.settings.advanced.processExecutor.timeout.description', 'Maximum execution time')}
                    value={settings.processExecutor?.timeoutMinutes?.weasyPrinttimeoutMinutes ?? 30}
                    onChange={(value) => setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        timeoutMinutes: { ...settings.processExecutor?.timeoutMinutes, weasyPrinttimeoutMinutes: Number(value) }
                      }
                    })}
                    min={1}
                    max={240}
                  />
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            {/* Install App */}
            <Accordion.Item value="installApp">
              <Accordion.Control>{t('admin.settings.advanced.processExecutor.installApp', 'Install App')}</Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  <NumberInput
                    label={t('admin.settings.advanced.processExecutor.sessionLimit', 'Session Limit')}
                    description={t('admin.settings.advanced.processExecutor.sessionLimit.description', 'Maximum concurrent instances')}
                    value={settings.processExecutor?.sessionLimit?.installAppSessionLimit ?? 1}
                    onChange={(value) => setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        sessionLimit: { ...settings.processExecutor?.sessionLimit, installAppSessionLimit: Number(value) }
                      }
                    })}
                    min={1}
                    max={100}
                  />
                  <NumberInput
                    label={t('admin.settings.advanced.processExecutor.timeout', 'Timeout (minutes)')}
                    description={t('admin.settings.advanced.processExecutor.timeout.description', 'Maximum execution time')}
                    value={settings.processExecutor?.timeoutMinutes?.installApptimeoutMinutes ?? 60}
                    onChange={(value) => setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        timeoutMinutes: { ...settings.processExecutor?.timeoutMinutes, installApptimeoutMinutes: Number(value) }
                      }
                    })}
                    min={1}
                    max={240}
                  />
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            {/* Calibre */}
            <Accordion.Item value="calibre">
              <Accordion.Control>{t('admin.settings.advanced.processExecutor.calibre', 'Calibre')}</Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  <NumberInput
                    label={t('admin.settings.advanced.processExecutor.sessionLimit', 'Session Limit')}
                    description={t('admin.settings.advanced.processExecutor.sessionLimit.description', 'Maximum concurrent instances')}
                    value={settings.processExecutor?.sessionLimit?.calibreSessionLimit ?? 1}
                    onChange={(value) => setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        sessionLimit: { ...settings.processExecutor?.sessionLimit, calibreSessionLimit: Number(value) }
                      }
                    })}
                    min={1}
                    max={100}
                  />
                  <NumberInput
                    label={t('admin.settings.advanced.processExecutor.timeout', 'Timeout (minutes)')}
                    description={t('admin.settings.advanced.processExecutor.timeout.description', 'Maximum execution time')}
                    value={settings.processExecutor?.timeoutMinutes?.calibretimeoutMinutes ?? 30}
                    onChange={(value) => setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        timeoutMinutes: { ...settings.processExecutor?.timeoutMinutes, calibretimeoutMinutes: Number(value) }
                      }
                    })}
                    min={1}
                    max={240}
                  />
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            {/* Ghostscript */}
            <Accordion.Item value="ghostscript">
              <Accordion.Control>{t('admin.settings.advanced.processExecutor.ghostscript', 'Ghostscript')}</Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  <NumberInput
                    label={t('admin.settings.advanced.processExecutor.sessionLimit', 'Session Limit')}
                    description={t('admin.settings.advanced.processExecutor.sessionLimit.description', 'Maximum concurrent instances')}
                    value={settings.processExecutor?.sessionLimit?.ghostscriptSessionLimit ?? 8}
                    onChange={(value) => setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        sessionLimit: { ...settings.processExecutor?.sessionLimit, ghostscriptSessionLimit: Number(value) }
                      }
                    })}
                    min={1}
                    max={100}
                  />
                  <NumberInput
                    label={t('admin.settings.advanced.processExecutor.timeout', 'Timeout (minutes)')}
                    description={t('admin.settings.advanced.processExecutor.timeout.description', 'Maximum execution time')}
                    value={settings.processExecutor?.timeoutMinutes?.ghostscriptTimeoutMinutes ?? 30}
                    onChange={(value) => setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        timeoutMinutes: { ...settings.processExecutor?.timeoutMinutes, ghostscriptTimeoutMinutes: Number(value) }
                      }
                    })}
                    min={1}
                    max={240}
                  />
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            {/* OCRmyPDF */}
            <Accordion.Item value="ocrMyPdf">
              <Accordion.Control>{t('admin.settings.advanced.processExecutor.ocrMyPdf', 'OCRmyPDF')}</Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  <NumberInput
                    label={t('admin.settings.advanced.processExecutor.sessionLimit', 'Session Limit')}
                    description={t('admin.settings.advanced.processExecutor.sessionLimit.description', 'Maximum concurrent instances')}
                    value={settings.processExecutor?.sessionLimit?.ocrMyPdfSessionLimit ?? 2}
                    onChange={(value) => setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        sessionLimit: { ...settings.processExecutor?.sessionLimit, ocrMyPdfSessionLimit: Number(value) }
                      }
                    })}
                    min={1}
                    max={100}
                  />
                  <NumberInput
                    label={t('admin.settings.advanced.processExecutor.timeout', 'Timeout (minutes)')}
                    description={t('admin.settings.advanced.processExecutor.timeout.description', 'Maximum execution time')}
                    value={settings.processExecutor?.timeoutMinutes?.ocrMyPdfTimeoutMinutes ?? 30}
                    onChange={(value) => setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        timeoutMinutes: { ...settings.processExecutor?.timeoutMinutes, ocrMyPdfTimeoutMinutes: Number(value) }
                      }
                    })}
                    min={1}
                    max={240}
                  />
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Stack>
      </Paper>

      {/* Save Button */}
      <Group justify="flex-end">
        <Button onClick={handleSave} loading={saving} size="sm">
          {t('admin.settings.save', 'Save Changes')}
        </Button>
      </Group>

      {/* Restart Confirmation Modal */}
      <RestartConfirmationModal
        opened={restartModalOpened}
        onClose={closeRestartModal}
        onRestart={restartServer}
      />
    </Stack>
  );
}
