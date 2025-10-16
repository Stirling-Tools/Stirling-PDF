import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NumberInput, Switch, Button, Stack, Paper, Text, Loader, Group, Accordion, TextInput } from '@mantine/core';
import { alert } from '../../../toast';
import RestartConfirmationModal from '../RestartConfirmationModal';
import { useRestartServer } from '../useRestartServer';

interface AdvancedSettingsData {
  enableAlphaFunctionality?: boolean;
  maxDPI?: number;
  enableUrlToPDF?: boolean;
  tessdataDir?: string;
  disableSanitize?: boolean;
}

export default function AdminAdvancedSection() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AdvancedSettingsData>({});
  const { restartModalOpened, showRestartModal, closeRestartModal, restartServer } = useRestartServer();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/v1/admin/settings/section/system');
      if (response.ok) {
        const data = await response.json();
        setSettings({
          enableAlphaFunctionality: data.enableAlphaFunctionality || false,
          maxDPI: data.maxDPI || 0,
          enableUrlToPDF: data.enableUrlToPDF || false,
          tessdataDir: data.tessdataDir || '',
          disableSanitize: data.disableSanitize || false
        });
      }
    } catch (error) {
      console.error('Failed to fetch advanced settings:', error);
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t('admin.settings.fetchError', 'Failed to load settings'),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Use delta update endpoint with dot notation
      const deltaSettings = {
        'system.enableAlphaFunctionality': settings.enableAlphaFunctionality,
        'system.maxDPI': settings.maxDPI,
        'system.enableUrlToPDF': settings.enableUrlToPDF,
        'system.tessdataDir': settings.tessdataDir,
        'system.disableSanitize': settings.disableSanitize
      };

      const response = await fetch('/api/v1/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: deltaSettings }),
      });

      if (response.ok) {
        showRestartModal();
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t('admin.settings.saveError', 'Failed to save settings'),
      });
    } finally {
      setSaving(false);
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
            <Switch
              checked={settings.enableAlphaFunctionality || false}
              onChange={(e) => setSettings({ ...settings, enableAlphaFunctionality: e.target.checked })}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.advanced.enableUrlToPDF', 'Enable URL to PDF')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.advanced.enableUrlToPDF.description', 'Allow conversion of web pages to PDF documents (internal use only)')}
              </Text>
            </div>
            <Switch
              checked={settings.enableUrlToPDF || false}
              onChange={(e) => setSettings({ ...settings, enableUrlToPDF: e.target.checked })}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.advanced.disableSanitize', 'Disable HTML Sanitization')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.advanced.disableSanitize.description', 'Disable HTML sanitization (WARNING: Security risk - can lead to XSS injections)')}
              </Text>
            </div>
            <Switch
              checked={settings.disableSanitize || false}
              onChange={(e) => setSettings({ ...settings, disableSanitize: e.target.checked })}
            />
          </div>
        </Stack>
      </Paper>

      {/* Processing Settings */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Text fw={600} size="sm" mb="xs">{t('admin.settings.advanced.processing', 'Processing')}</Text>

          <div>
            <NumberInput
              label={t('admin.settings.advanced.maxDPI', 'Maximum DPI')}
              description={t('admin.settings.advanced.maxDPI.description', 'Maximum DPI for image processing (0 = unlimited)')}
              value={settings.maxDPI || 0}
              onChange={(value) => setSettings({ ...settings, maxDPI: Number(value) })}
              min={0}
              max={3000}
            />
          </div>

          <div>
            <TextInput
              label={t('admin.settings.advanced.tessdataDir', 'Tessdata Directory')}
              description={t('admin.settings.advanced.tessdataDir.description', 'Path to the directory containing Tessdata files for OCR')}
              value={settings.tessdataDir || ''}
              onChange={(e) => setSettings({ ...settings, tessdataDir: e.target.value })}
              placeholder="/usr/share/tessdata"
            />
          </div>
        </Stack>
      </Paper>

      {/* Endpoints Info */}
      <Paper withBorder p="md" radius="md">
        <Accordion variant="separated">
          <Accordion.Item value="endpoints">
            <Accordion.Control>
              {t('admin.settings.advanced.endpoints.manage', 'Manage API Endpoints')}
            </Accordion.Control>
            <Accordion.Panel>
              <Text size="sm" c="dimmed">
                {t('admin.settings.advanced.endpoints.description', 'Endpoint management is configured via YAML. See documentation for details on enabling/disabling specific endpoints.')}
              </Text>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
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
