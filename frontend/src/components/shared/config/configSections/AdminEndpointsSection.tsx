import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Stack, Paper, Text, Loader, Group, MultiSelect } from '@mantine/core';
import { alert } from '../../../toast';

interface EndpointsSettingsData {
  toRemove?: string[];
  groupsToRemove?: string[];
}

export default function AdminEndpointsSection() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<EndpointsSettingsData>({});

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/v1/admin/settings/section/endpoints');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Failed to fetch endpoints settings:', error);
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
      const response = await fetch('/api/v1/admin/settings/section/endpoints', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        alert({
          alertType: 'success',
          title: t('admin.success', 'Success'),
          body: t('admin.settings.saved', 'Settings saved. Restart required for changes to take effect.'),
        });
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

  // Common endpoint examples
  const commonEndpoints = [
    'img-to-pdf',
    'pdf-to-img',
    'merge-pdfs',
    'split-pdf',
    'rotate-pdf',
    'compress-pdf',
    'extract-images',
    'extract-image-scans',
    'add-watermark',
    'remove-watermark',
    'add-password',
    'remove-password',
    'change-permissions',
    'ocr-pdf',
    'pdf-to-pdfa',
    'html-to-pdf',
    'url-to-pdf',
    'markdown-to-pdf',
    'get-info-on-pdf',
    'extract-pdf-metadata',
    'pdf-to-single-page',
    'crop',
    'auto-split-pdf',
    'sanitize-pdf',
    'add-page-numbers',
    'auto-rename',
    'scale-pages',
    'repair',
    'flatten',
    'remove-blanks',
    'compare-pdfs'
  ];

  // Common endpoint groups
  const commonGroups = [
    'Conversion',
    'Security',
    'Other',
    'Organize',
    'LibreOffice',
    'CLI',
    'Python',
    'OpenCV'
  ];

  return (
    <Stack gap="lg">
      <div>
        <Text fw={600} size="lg">{t('admin.settings.endpoints.title', 'API Endpoints')}</Text>
        <Text size="sm" c="dimmed">
          {t('admin.settings.endpoints.description', 'Control which API endpoints and endpoint groups are available.')}
        </Text>
      </div>

      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Text fw={600} size="sm" mb="xs">{t('admin.settings.endpoints.management', 'Endpoint Management')}</Text>

          <div>
            <MultiSelect
              label={t('admin.settings.endpoints.toRemove', 'Disabled Endpoints')}
              description={t('admin.settings.endpoints.toRemove.description', 'Select individual endpoints to disable')}
              value={settings.toRemove || []}
              onChange={(value) => setSettings({ ...settings, toRemove: value })}
              data={commonEndpoints.map(endpoint => ({ value: endpoint, label: endpoint }))}
              searchable
              clearable
              placeholder="Select endpoints to disable"
              comboboxProps={{ zIndex: 1400 }}
            />
          </div>

          <div>
            <MultiSelect
              label={t('admin.settings.endpoints.groupsToRemove', 'Disabled Endpoint Groups')}
              description={t('admin.settings.endpoints.groupsToRemove.description', 'Select endpoint groups to disable')}
              value={settings.groupsToRemove || []}
              onChange={(value) => setSettings({ ...settings, groupsToRemove: value })}
              data={commonGroups.map(group => ({ value: group, label: group }))}
              searchable
              clearable
              placeholder="Select groups to disable"
              comboboxProps={{ zIndex: 1400 }}
            />
          </div>

          <Paper bg="var(--mantine-color-blue-light)" p="sm" radius="sm">
            <Text size="xs" c="dimmed">
              {t('admin.settings.endpoints.note', 'Note: Disabling endpoints restricts API access but does not remove UI components. Restart required for changes to take effect.')}
            </Text>
          </Paper>
        </Stack>
      </Paper>

      <Group justify="flex-end">
        <Button onClick={handleSave} loading={saving} size="sm">
          {t('admin.settings.save', 'Save Changes')}
        </Button>
      </Group>
    </Stack>
  );
}
