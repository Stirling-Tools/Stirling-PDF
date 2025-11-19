import React, { useState, useEffect } from 'react';
import { Paper, Stack, Switch, Text, Tooltip, NumberInput, SegmentedControl, Code, Group, Anchor, ActionIcon, Button, Badge, Alert } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '@app/contexts/PreferencesContext';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import type { ToolPanelMode } from '@app/constants/toolPanel';
import LocalIcon from '@app/components/shared/LocalIcon';
import { updateService, UpdateSummary } from '@app/services/updateService';
import UpdateModal from '@app/components/shared/UpdateModal';

const DEFAULT_AUTO_UNZIP_FILE_LIMIT = 4;
const BANNER_DISMISSED_KEY = 'stirlingpdf_features_banner_dismissed';

interface GeneralSectionProps {
  hideTitle?: boolean;
}

const GeneralSection: React.FC<GeneralSectionProps> = ({ hideTitle = false }) => {
  const { t } = useTranslation();
  const { preferences, updatePreference } = usePreferences();
  const { config } = useAppConfig();
  const [fileLimitInput, setFileLimitInput] = useState<number | string>(preferences.autoUnzipFileLimit);
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    // Check localStorage on mount
    return localStorage.getItem(BANNER_DISMISSED_KEY) === 'true';
  });
  const [updateSummary, setUpdateSummary] = useState<UpdateSummary | null>(null);
  const [updateModalOpened, setUpdateModalOpened] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  // Sync local state with preference changes
  useEffect(() => {
    setFileLimitInput(preferences.autoUnzipFileLimit);
  }, [preferences.autoUnzipFileLimit]);

  // Check for updates on mount
  useEffect(() => {
    if (config?.appVersion && config?.machineType) {
      checkForUpdate();
    }
  }, [config?.appVersion, config?.machineType]);

  const checkForUpdate = async () => {
    if (!config?.appVersion || !config?.machineType) {
      return;
    }

    setCheckingUpdate(true);
    const machineInfo = {
      machineType: config.machineType,
      activeSecurity: config.activeSecurity ?? false,
      licenseType: config.license ?? 'NORMAL',
    };

    const summary = await updateService.getUpdateSummary(config.appVersion, machineInfo);
    if (summary) {
      const isNewerVersion = updateService.compareVersions(summary.latest_version, config.appVersion) > 0;
      if (isNewerVersion) {
        setUpdateSummary(summary);
      }
    }
    setCheckingUpdate(false);
  };

  // Check if login is disabled
  const loginDisabled = !config?.enableLogin;

  const handleDismissBanner = () => {
    setBannerDismissed(true);
    localStorage.setItem(BANNER_DISMISSED_KEY, 'true');
  };

  return (
    <Stack gap="lg">
      {!hideTitle && (
        <div>
          <Text fw={600} size="lg">{t('settings.general.title', 'General')}</Text>
          <Text size="sm" c="dimmed">
            {t('settings.general.description', 'Configure general application preferences.')}
          </Text>
        </div>
      )}

      {loginDisabled && !bannerDismissed && (
        <Paper withBorder p="md" radius="md" style={{ background: 'var(--mantine-color-blue-0)', position: 'relative' }}>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            style={{ position: 'absolute', top: '0.5rem', right: '0.5rem' }}
            onClick={handleDismissBanner}
            aria-label={t('settings.general.enableFeatures.dismiss', 'Dismiss')}
          >
            <LocalIcon icon="close-rounded" width="1rem" height="1rem" />
          </ActionIcon>
          <Stack gap="sm">
            <Group gap="xs">
              <LocalIcon icon="admin-panel-settings-rounded" width="1.2rem" height="1.2rem" style={{ color: 'var(--mantine-color-blue-6)' }} />
              <Text fw={600} size="sm" style={{ color: 'var(--mantine-color-blue-9)' }}>
                {t('settings.general.enableFeatures.title', 'For System Administrators')}
              </Text>
            </Group>
            <Text size="sm" c="dimmed">
              {t('settings.general.enableFeatures.intro', 'Enable user authentication, team management, and workspace features for your organization.')}
            </Text>
            <Group gap="xs" wrap="wrap">
              <Text size="sm" c="dimmed">
                {t('settings.general.enableFeatures.action', 'Configure')}
              </Text>
              <Code>SECURITY_ENABLELOGIN=true</Code>
              <Text size="sm" c="dimmed">
                {t('settings.general.enableFeatures.and', 'and')}
              </Text>
              <Code>DISABLE_ADDITIONAL_FEATURES=false</Code>
            </Group>
            <Text size="xs" c="dimmed" fs="italic">
              {t('settings.general.enableFeatures.benefit', 'Enables user roles, team collaboration, admin controls, and enterprise features.')}
            </Text>
            <Anchor
              href="https://docs.stirlingpdf.com/Advanced%20Configuration/System%20and%20Security"
              target="_blank"
              size="sm"
              style={{ color: 'var(--mantine-color-blue-6)' }}
            >
              {t('settings.general.enableFeatures.learnMore', 'Learn more in documentation')} →
            </Anchor>
          </Stack>
        </Paper>
      )}

      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">
                {t('settings.general.defaultToolPickerMode', 'Default tool picker mode')}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('settings.general.defaultToolPickerModeDescription', 'Choose whether the tool picker opens in fullscreen or sidebar by default')}
              </Text>
            </div>
            <SegmentedControl
              value={preferences.defaultToolPanelMode}
              onChange={(val: string) => updatePreference('defaultToolPanelMode', val as ToolPanelMode)}
              data={[
                { label: t('settings.general.mode.sidebar', 'Sidebar'), value: 'sidebar' },
                { label: t('settings.general.mode.fullscreen', 'Fullscreen'), value: 'fullscreen' },
              ]}
            />
          </div>
          <Tooltip
            label={t('settings.general.autoUnzipTooltip', 'Automatically extract ZIP files returned from API operations. Disable to keep ZIP files intact. This does not affect automation workflows.')}
            multiline
            w={300}
            withArrow
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'help' }}>
              <div>
                <Text fw={500} size="sm">
                  {t('settings.general.autoUnzip', 'Auto-unzip API responses')}
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  {t('settings.general.autoUnzipDescription', 'Automatically extract files from ZIP responses')}
                </Text>
              </div>
              <Switch
                checked={preferences.autoUnzip}
                onChange={(event) => updatePreference('autoUnzip', event.currentTarget.checked)}
              />
            </div>
          </Tooltip>

          <Tooltip
            label={t('settings.general.autoUnzipFileLimitTooltip', 'Only unzip if the ZIP contains this many files or fewer. Set higher to extract larger ZIPs.')}
            multiline
            w={300}
            withArrow
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'help' }}>
              <div>
                <Text fw={500} size="sm">
                  {t('settings.general.autoUnzipFileLimit', 'Auto-unzip file limit')}
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  {t('settings.general.autoUnzipFileLimitDescription', 'Maximum number of files to extract from ZIP')}
                </Text>
              </div>
              <NumberInput
                value={fileLimitInput}
                onChange={setFileLimitInput}
                onBlur={() => {
                  const numValue = Number(fileLimitInput);
                  const finalValue = (!fileLimitInput || isNaN(numValue) || numValue < 1 || numValue > 100) ? DEFAULT_AUTO_UNZIP_FILE_LIMIT : numValue;
                  setFileLimitInput(finalValue);
                  updatePreference('autoUnzipFileLimit', finalValue);
                }}
                min={1}
                max={100}
                step={1}
                disabled={!preferences.autoUnzip}
                style={{ width: 90 }}
              />
            </div>
          </Tooltip>
        </Stack>
      </Paper>

      {/* Update Check Section */}
      {config?.appVersion && (
        <Paper withBorder p="md" radius="md">
          <Stack gap="md">
            <div>
              <Group justify="space-between" align="center">
                <div>
                  <Text fw={600} size="sm">
                    {t('settings.general.updates.title', 'Software Updates')}
                  </Text>
                  <Text size="xs" c="dimmed" mt={4}>
                    {t('settings.general.updates.description', 'Check for updates and view version information')}
                  </Text>
                </div>
                {updateSummary && (
                  <Badge
                    color={updateSummary.max_priority === 'urgent' ? 'red' : 'blue'}
                    variant="filled"
                  >
                    {updateSummary.max_priority === 'urgent'
                      ? t('update.urgentUpdateAvailable', 'Urgent Update')
                      : t('update.updateAvailable', 'Update Available')}
                  </Badge>
                )}
              </Group>
            </div>

            <Group justify="space-between" align="center">
              <div>
                <Text size="sm" c="dimmed">
                  {t('settings.general.updates.currentVersion', 'Current Version')}:{' '}
                  <Text component="span" fw={500}>
                    {config.appVersion}
                  </Text>
                </Text>
                {updateSummary && (
                  <Text size="sm" c="dimmed" mt={4}>
                    {t('settings.general.updates.latestVersion', 'Latest Version')}:{' '}
                    <Text component="span" fw={500} c="blue">
                      {updateSummary.latest_version}
                    </Text>
                  </Text>
                )}
              </div>
              <Group gap="sm">
                <Button
                  size="sm"
                  variant="default"
                  onClick={checkForUpdate}
                  loading={checkingUpdate}
                  leftSection={<LocalIcon icon="refresh-rounded" width="1rem" height="1rem" />}
                >
                  {t('settings.general.updates.checkForUpdates', 'Check for Updates')}
                </Button>
                {updateSummary && (
                  <Button
                    size="sm"
                    color={updateSummary.max_priority === 'urgent' ? 'red' : 'blue'}
                    onClick={() => setUpdateModalOpened(true)}
                    leftSection={<LocalIcon icon="system-update-rounded" width="1rem" height="1rem" />}
                  >
                    {t('settings.general.updates.viewDetails', 'View Details')}
                  </Button>
                )}
              </Group>
            </Group>

            {updateSummary?.any_breaking && (
              <Alert
                color="orange"
                title={t('update.breakingChangesDetected', 'Breaking Changes Detected')}
                styles={{
                  title: { fontWeight: 600 }
                }}
              >
                <Text size="sm">
                  {t(
                    'update.breakingChangesMessage',
                    'Some versions contain breaking changes. Please review the migration guides before updating.'
                  )}
                </Text>
              </Alert>
            )}
          </Stack>
        </Paper>
      )}

      {/* Update Modal */}
      {updateSummary && config?.appVersion && config?.machineType && (
        <UpdateModal
          opened={updateModalOpened}
          onClose={() => setUpdateModalOpened(false)}
          currentVersion={config.appVersion}
          updateSummary={updateSummary}
          machineInfo={{
            machineType: config.machineType,
            activeSecurity: config.activeSecurity ?? false,
            licenseType: config.license ?? 'NORMAL',
          }}
        />
      )}
    </Stack>
  );
};

export default GeneralSection;
