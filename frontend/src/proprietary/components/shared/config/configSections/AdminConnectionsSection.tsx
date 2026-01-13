import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Stack, Text, Loader, Group, Divider, Paper, Switch, Badge, Anchor, Select, Collapse } from '@mantine/core';
import { alert } from '@app/components/toast';
import LocalIcon from '@app/components/shared/LocalIcon';
import RestartConfirmationModal from '@app/components/shared/config/RestartConfirmationModal';
import { useRestartServer } from '@app/components/shared/config/useRestartServer';
import { useAdminSettings } from '@app/hooks/useAdminSettings';
import PendingBadge from '@app/components/shared/config/PendingBadge';
import { Z_INDEX_CONFIG_MODAL } from '@app/styles/zIndex';
import ProviderCard from '@app/components/shared/config/configSections/ProviderCard';
import {
  ALL_PROVIDERS,
  Provider,
} from '@app/components/shared/config/configSections/providerDefinitions';
import apiClient from '@app/services/apiClient';
import { useLoginRequired } from '@app/hooks/useLoginRequired';
import LoginRequiredBanner from '@app/components/shared/config/LoginRequiredBanner';

interface ConnectionsSettingsData {
  oauth2?: {
    enabled?: boolean;
    issuer?: string;
    clientId?: string;
    clientSecret?: string;
    provider?: string;
    autoCreateUser?: boolean;
    blockRegistration?: boolean;
    useAsUsername?: string;
    scopes?: string;
    client?: {
      [key: string]: any;
    };
  };
  saml2?: {
    [key: string]: any;
  };
  mail?: {
    enabled?: boolean;
    enableInvites?: boolean;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    from?: string;
  };
  ssoAutoLogin?: boolean;
  enableMobileScanner?: boolean;
  mobileScannerConvertToPdf?: boolean;
  mobileScannerImageResolution?: string;
  mobileScannerPageFormat?: string;
  mobileScannerStretchToFit?: boolean;
}

export default function AdminConnectionsSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { loginEnabled, validateLoginEnabled, getDisabledStyles } = useLoginRequired();
  const { restartModalOpened, showRestartModal, closeRestartModal, restartServer } = useRestartServer();

  const adminSettings = useAdminSettings<ConnectionsSettingsData>({
    sectionName: 'connections',
    fetchTransformer: async () => {
      // Fetch security settings (oauth2, saml2)
      const securityResponse = await apiClient.get('/api/v1/admin/settings/section/security');
      const securityData = securityResponse.data || {};

      // Fetch mail settings
      const mailResponse = await apiClient.get('/api/v1/admin/settings/section/mail');
      const mailData = mailResponse.data || {};

      // Fetch premium settings for SSO Auto Login
      const premiumResponse = await apiClient.get('/api/v1/admin/settings/section/premium');
      const premiumData = premiumResponse.data || {};

      // Fetch system settings for enableMobileScanner
      const systemResponse = await apiClient.get('/api/v1/admin/settings/section/system');
      const systemData = systemResponse.data || {};

      const result: any = {
        oauth2: securityData.oauth2 || {},
        saml2: securityData.saml2 || {},
        mail: mailData || {},
        ssoAutoLogin: premiumData.proFeatures?.ssoAutoLogin || false,
        enableMobileScanner: systemData.enableMobileScanner || false,
        mobileScannerConvertToPdf: systemData.mobileScannerSettings?.convertToPdf !== false,
        mobileScannerImageResolution: systemData.mobileScannerSettings?.imageResolution || 'full',
        mobileScannerPageFormat: systemData.mobileScannerSettings?.pageFormat || 'A4',
        mobileScannerStretchToFit: systemData.mobileScannerSettings?.stretchToFit || false
      };

      // Merge pending blocks from all four endpoints
      const pendingBlock: any = {};
      if (securityData._pending?.oauth2) {
        pendingBlock.oauth2 = securityData._pending.oauth2;
      }
      if (securityData._pending?.saml2) {
        pendingBlock.saml2 = securityData._pending.saml2;
      }
      if (mailData._pending) {
        pendingBlock.mail = mailData._pending;
      }
      if (premiumData._pending?.proFeatures?.ssoAutoLogin !== undefined) {
        pendingBlock.ssoAutoLogin = premiumData._pending.proFeatures.ssoAutoLogin;
      }
      if (systemData._pending?.enableMobileScanner !== undefined) {
        pendingBlock.enableMobileScanner = systemData._pending.enableMobileScanner;
      }
      if (systemData._pending?.mobileScannerSettings?.convertToPdf !== undefined) {
        pendingBlock.mobileScannerConvertToPdf = systemData._pending.mobileScannerSettings.convertToPdf;
      }
      if (systemData._pending?.mobileScannerSettings?.imageResolution !== undefined) {
        pendingBlock.mobileScannerImageResolution = systemData._pending.mobileScannerSettings.imageResolution;
      }
      if (systemData._pending?.mobileScannerSettings?.pageFormat !== undefined) {
        pendingBlock.mobileScannerPageFormat = systemData._pending.mobileScannerSettings.pageFormat;
      }
      if (systemData._pending?.mobileScannerSettings?.stretchToFit !== undefined) {
        pendingBlock.mobileScannerStretchToFit = systemData._pending.mobileScannerSettings.stretchToFit;
      }

      if (Object.keys(pendingBlock).length > 0) {
        result._pending = pendingBlock;
      }

      return result;
    },
    saveTransformer: () => {
      // This section doesn't have a global save button
      // Individual providers save through their own handlers
      return {
        sectionData: {},
        deltaSettings: {}
      };
    }
  });

  const {
    settings,
    setSettings,
    loading,
    fetchSettings,
    isFieldPending,
  } = adminSettings;

  useEffect(() => {
    if (loginEnabled) {
      fetchSettings();
    }
  }, [loginEnabled, fetchSettings]);

  // Override loading state when login is disabled
  const actualLoading = loginEnabled ? loading : false;

  const isProviderConfigured = (provider: Provider): boolean => {
    if (provider.id === 'saml2') {
      return settings?.saml2?.enabled === true;
    }

    if (provider.id === 'smtp') {
      return settings?.mail?.enabled === true;
    }

    if (provider.id === 'oauth2-generic') {
      return settings?.oauth2?.enabled === true;
    }

    // Check if specific OAuth2 provider is configured (has clientId)
    const providerSettings = settings?.oauth2?.client?.[provider.id];
    return !!(providerSettings?.clientId);
  };

  const getProviderSettings = (provider: Provider): Record<string, any> => {
    if (provider.id === 'saml2') {
      return settings?.saml2 || {};
    }

    if (provider.id === 'smtp') {
      return settings?.mail || {};
    }

    if (provider.id === 'oauth2-generic') {
      // Generic OAuth2 settings are at the root oauth2 level
      return {
        enabled: settings?.oauth2?.enabled,
        provider: settings?.oauth2?.provider,
        issuer: settings?.oauth2?.issuer,
        clientId: settings?.oauth2?.clientId,
        clientSecret: settings?.oauth2?.clientSecret,
        scopes: settings?.oauth2?.scopes,
        useAsUsername: settings?.oauth2?.useAsUsername,
        autoCreateUser: settings?.oauth2?.autoCreateUser,
        blockRegistration: settings?.oauth2?.blockRegistration,
      };
    }

    // Specific OAuth2 provider settings
    return settings?.oauth2?.client?.[provider.id] || {};
  };

  const handleProviderSave = async (provider: Provider, providerSettings: Record<string, any>) => {
    // Block save if login is disabled
    if (!validateLoginEnabled()) {
      return;
    }

    try {
      if (provider.id === 'smtp') {
        // Mail settings use a different endpoint
        const response = await apiClient.put('/api/v1/admin/settings/section/mail', providerSettings);

        if (response.status === 200) {
          await fetchSettings(); // Refresh settings
          alert({
            alertType: 'success',
            title: t('admin.success', 'Success'),
            body: t('admin.settings.saveSuccess', 'Settings saved successfully'),
          });
          showRestartModal();
        } else {
          throw new Error('Failed to save');
        }
      } else {
        // OAuth2/SAML2 use delta settings
        const deltaSettings: Record<string, any> = {};

        if (provider.id === 'saml2') {
          // SAML2 settings
          Object.keys(providerSettings).forEach((key) => {
            deltaSettings[`security.saml2.${key}`] = providerSettings[key];
          });
        } else if (provider.id === 'oauth2-generic') {
          // Generic OAuth2 settings at root level
          Object.keys(providerSettings).forEach((key) => {
            deltaSettings[`security.oauth2.${key}`] = providerSettings[key];
          });
        } else {
          // Specific OAuth2 provider (google, github, keycloak)
          Object.keys(providerSettings).forEach((key) => {
            deltaSettings[`security.oauth2.client.${provider.id}.${key}`] = providerSettings[key];
          });
        }

        const response = await apiClient.put('/api/v1/admin/settings', { settings: deltaSettings });

        if (response.status === 200) {
          await fetchSettings(); // Refresh settings
          alert({
            alertType: 'success',
            title: t('admin.success', 'Success'),
            body: t('admin.settings.saveSuccess', 'Settings saved successfully'),
          });
          showRestartModal();
        } else {
          throw new Error('Failed to save');
        }
      }
    } catch (_error) {
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t('admin.settings.saveError', 'Failed to save settings'),
      });
    }
  };

  const handleProviderDisconnect = async (provider: Provider) => {
    // Block disconnect if login is disabled
    if (!validateLoginEnabled()) {
      return;
    }

    try{
      if (provider.id === 'smtp') {
        // Mail settings use a different endpoint
        const response = await apiClient.put('/api/v1/admin/settings/section/mail', { enabled: false });

        if (response.status === 200) {
          await fetchSettings();
          alert({
            alertType: 'success',
            title: t('admin.success', 'Success'),
            body: t('admin.settings.connections.disconnected', 'Provider disconnected successfully'),
          });
          showRestartModal();
        } else {
          throw new Error('Failed to disconnect');
        }
      } else {
        const deltaSettings: Record<string, any> = {};

        if (provider.id === 'saml2') {
          deltaSettings['security.saml2.enabled'] = false;
        } else if (provider.id === 'oauth2-generic') {
          deltaSettings['security.oauth2.enabled'] = false;
        } else {
          // Clear all fields for specific OAuth2 provider
          provider.fields.forEach((field) => {
            deltaSettings[`security.oauth2.client.${provider.id}.${field.key}`] = '';
          });
        }

        const response = await apiClient.put('/api/v1/admin/settings', { settings: deltaSettings });

        if (response.status === 200) {
          await fetchSettings();
          alert({
            alertType: 'success',
            title: t('admin.success', 'Success'),
            body: t('admin.settings.connections.disconnected', 'Provider disconnected successfully'),
          });
          showRestartModal();
        } else {
          throw new Error('Failed to disconnect');
        }
      }
    } catch (_error) {
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t('admin.settings.connections.disconnectError', 'Failed to disconnect provider'),
      });
    }
  };

  if (actualLoading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
      </Stack>
    );
  }

  const handleSSOAutoLoginSave = async () => {
    // Block save if login is disabled
    if (!validateLoginEnabled()) {
      return;
    }

    try {
      const deltaSettings = {
        'premium.proFeatures.ssoAutoLogin': settings?.ssoAutoLogin
      };

      const response = await apiClient.put('/api/v1/admin/settings', { settings: deltaSettings });

      if (response.status === 200) {
        alert({
          alertType: 'success',
          title: t('admin.success', 'Success'),
          body: t('admin.settings.saveSuccess', 'Settings saved successfully'),
        });
        showRestartModal();
      } else {
        throw new Error('Failed to save');
      }
    } catch (_error) {
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t('admin.settings.saveError', 'Failed to save settings'),
      });
    }
  };

  const handleMobileScannerSave = async (newValue: boolean) => {
    // Block save if login is disabled
    if (!validateLoginEnabled()) {
      return;
    }

    try {
      const deltaSettings = {
        'system.enableMobileScanner': newValue
      };

      const response = await apiClient.put('/api/v1/admin/settings', { settings: deltaSettings });

      if (response.status === 200) {
        alert({
          alertType: 'success',
          title: t('admin.settings.success', 'Settings saved successfully')
        });
        fetchSettings();
      }
    } catch (error) {
      console.error('Failed to save mobile scanner setting:', error);
      alert({
        alertType: 'error',
        title: t('admin.settings.error', 'Failed to save settings')
      });
    }
  };

  const handleMobileScannerSettingsSave = async (settingKey: string, newValue: string | boolean) => {
    // Block save if login is disabled or mobile scanner is not enabled
    if (!validateLoginEnabled() || !settings?.enableMobileScanner) {
      return;
    }

    try {
      const deltaSettings = {
        [`system.mobileScannerSettings.${settingKey}`]: newValue
      };

      const response = await apiClient.put('/api/v1/admin/settings', { settings: deltaSettings });

      if (response.status === 200) {
        alert({
          alertType: 'success',
          title: t('admin.success', 'Success'),
          body: t('admin.settings.saveSuccess', 'Settings saved successfully'),
        });
        showRestartModal();
      } else {
        throw new Error('Failed to save');
      }
    } catch (_error) {
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t('admin.settings.saveError', 'Failed to save settings'),
      });
    }
  };

  const linkedProviders = ALL_PROVIDERS.filter((p) => isProviderConfigured(p));
  const availableProviders = ALL_PROVIDERS.filter((p) => !isProviderConfigured(p));

  return (
    <Stack gap="xl">
      <LoginRequiredBanner show={!loginEnabled} />

      {/* Header */}
      <div>
        <Text fw={600} size="lg">
          {t('admin.settings.connections.title', 'Connections')}
        </Text>
        <Text size="sm" c="dimmed">
          {t(
            'admin.settings.connections.description',
            'Configure external authentication providers like OAuth2 and SAML.'
          )}
        </Text>
      </div>

      {/* SSO Auto Login - Premium Feature */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Text fw={600} size="sm">{t('admin.settings.connections.ssoAutoLogin.label', 'SSO Auto Login')}</Text>
            <Badge
              color="grape"
              size="sm"
              style={{ cursor: 'pointer' }}
              onClick={() => navigate('/settings/adminPlan')}
              title={t('admin.settings.badge.clickToUpgrade', 'Click to view plan details')}
            >
              PRO
            </Badge>
          </Group>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.connections.ssoAutoLogin.enable', 'Enable SSO Auto Login')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.connections.ssoAutoLogin.description', 'Automatically redirect to SSO login when authentication is required')}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings?.ssoAutoLogin || false}
                onChange={(e) => {
                  if (!loginEnabled) return; // Block change when login disabled
                  setSettings({ ...settings, ssoAutoLogin: e.target.checked });
                  handleSSOAutoLoginSave();
                }}
                disabled={!loginEnabled}
                styles={getDisabledStyles()}
              />
              <PendingBadge show={isFieldPending('ssoAutoLogin')} />
            </Group>
          </div>
        </Stack>
      </Paper>

      {/* Mobile Scanner (QR Code) Upload */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Group gap="xs" align="center">
            <LocalIcon icon="qr-code-rounded" width="1.25rem" height="1.25rem" />
            <Text fw={600} size="sm">{t('admin.settings.connections.mobileScanner.label', 'Mobile Phone Upload')}</Text>
          </Group>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.connections.mobileScanner.enable', 'Enable QR Code Upload')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.connections.mobileScanner.description', 'Allow users to upload files from mobile devices by scanning a QR code')}
              </Text>
              <Text size="xs" c="orange" mt={8} fw={500}>
                {t('admin.settings.connections.mobileScanner.note', 'Note: Requires Frontend URL to be configured. ')}
                <Anchor href="#" onClick={(e) => { e.preventDefault(); navigate('/settings/adminGeneral#frontendUrl'); }} c="orange" td="underline">
                  {t('admin.settings.connections.mobileScanner.link', 'Configure in System Settings')}
                </Anchor>
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings?.enableMobileScanner || false}
                onChange={(e) => {
                  if (!loginEnabled) return; // Block change when login disabled
                  const newValue = e.target.checked;
                  setSettings({ ...settings, enableMobileScanner: newValue });
                  handleMobileScannerSave(newValue);
                }}
                disabled={!loginEnabled}
                styles={getDisabledStyles()}
              />
              <PendingBadge show={isFieldPending('enableMobileScanner')} />
            </Group>
          </div>

          {/* Mobile Scanner Settings - Only show when enabled */}
          <Collapse in={settings?.enableMobileScanner || false}>
            <Stack gap="md" mt="md" ml="lg" style={{ borderLeft: '2px solid var(--mantine-color-gray-3)', paddingLeft: '1rem' }}>
              {/* Convert to PDF */}
              <div>
                <Text size="sm" fw={500} mb="xs">
                  {t('admin.settings.connections.mobileScannerConvertToPdf', 'Convert Images to PDF')}
                </Text>
                <Text size="xs" c="dimmed" mb="sm">
                  {t('admin.settings.connections.mobileScannerConvertToPdfDesc', 'Automatically convert uploaded images to PDF format. If disabled, images will be kept as-is.')}
                </Text>
                <Group gap="xs">
                  <Switch
                    checked={settings?.mobileScannerConvertToPdf !== false}
                    onChange={(e) => {
                      if (!loginEnabled) return;
                      const newValue = e.target.checked;
                      setSettings({ ...settings, mobileScannerConvertToPdf: newValue });
                      handleMobileScannerSettingsSave('convertToPdf', newValue);
                    }}
                    disabled={!loginEnabled}
                  />
                  <PendingBadge show={isFieldPending('mobileScannerConvertToPdf')} />
                </Group>
              </div>

              {/* PDF Conversion Settings - Only show when convertToPdf is enabled */}
              {settings?.mobileScannerConvertToPdf !== false && (
                <>
                  {/* Image Resolution */}
                  <div>
                    <Text size="sm" fw={500} mb="xs">
                      {t('admin.settings.connections.mobileScannerImageResolution', 'Image Resolution')}
                    </Text>
                    <Text size="xs" c="dimmed" mb="sm">
                      {t('admin.settings.connections.mobileScannerImageResolutionDesc', 'Resolution of uploaded images. "Reduced" scales images to max 1200px to reduce file size.')}
                    </Text>
                    <Group gap="xs">
                      <Select
                        value={settings?.mobileScannerImageResolution || 'full'}
                        onChange={(value) => {
                          if (!loginEnabled) return;
                          setSettings({ ...settings, mobileScannerImageResolution: value || 'full' });
                          handleMobileScannerSettingsSave('imageResolution', value || 'full');
                        }}
                        data={[
                          { value: 'full', label: t('admin.settings.connections.imageResolutionFull', 'Full (Original Size)') },
                          { value: 'reduced', label: t('admin.settings.connections.imageResolutionReduced', 'Reduced (Max 1200px)') }
                        ]}
                        disabled={!loginEnabled}
                        style={{ width: '250px' }}
                        comboboxProps={{ zIndex: Z_INDEX_CONFIG_MODAL }}
                      />
                      <PendingBadge show={isFieldPending('mobileScannerImageResolution')} />
                    </Group>
                  </div>

                  {/* Page Format */}
                  <div>
                    <Text size="sm" fw={500} mb="xs">
                      {t('admin.settings.connections.mobileScannerPageFormat', 'Page Format')}
                    </Text>
                    <Text size="xs" c="dimmed" mb="sm">
                      {t('admin.settings.connections.mobileScannerPageFormatDesc', 'PDF page size for converted images. "Keep" uses original image dimensions.')}
                    </Text>
                    <Group gap="xs">
                      <Select
                        value={settings?.mobileScannerPageFormat || 'A4'}
                        onChange={(value) => {
                          if (!loginEnabled) return;
                          setSettings({ ...settings, mobileScannerPageFormat: value || 'A4' });
                          handleMobileScannerSettingsSave('pageFormat', value || 'A4');
                        }}
                        data={[
                          { value: 'keep', label: t('admin.settings.connections.pageFormatKeep', 'Keep (Original Dimensions)') },
                          { value: 'A4', label: t('admin.settings.connections.pageFormatA4', 'A4 (210×297mm)') },
                          { value: 'letter', label: t('admin.settings.connections.pageFormatLetter', 'Letter (8.5×11in)') }
                        ]}
                        disabled={!loginEnabled}
                        style={{ width: '250px' }}
                        comboboxProps={{ zIndex: Z_INDEX_CONFIG_MODAL }}
                      />
                      <PendingBadge show={isFieldPending('mobileScannerPageFormat')} />
                    </Group>
                  </div>

                  {/* Stretch to Fit */}
                  <div>
                    <Text size="sm" fw={500} mb="xs">
                      {t('admin.settings.connections.mobileScannerStretchToFit', 'Stretch to Fit')}
                    </Text>
                    <Text size="xs" c="dimmed" mb="sm">
                      {t('admin.settings.connections.mobileScannerStretchToFitDesc', 'Stretch images to fill the entire page. If disabled, images are centered with preserved aspect ratio.')}
                    </Text>
                    <Group gap="xs">
                      <Switch
                        checked={settings?.mobileScannerStretchToFit || false}
                        onChange={(e) => {
                          if (!loginEnabled) return;
                          const newValue = e.target.checked;
                          setSettings({ ...settings, mobileScannerStretchToFit: newValue });
                          handleMobileScannerSettingsSave('stretchToFit', newValue);
                        }}
                        disabled={!loginEnabled}
                      />
                      <PendingBadge show={isFieldPending('mobileScannerStretchToFit')} />
                    </Group>
                  </div>
                </>
              )}
            </Stack>
          </Collapse>
        </Stack>
      </Paper>

      {/* Linked Services Section - Only show if there are linked providers */}
      {linkedProviders.length > 0 && (
        <>
          <div>
            <Text fw={600} size="md" mb="md">
              {t('admin.settings.connections.linkedServices', 'Linked Services')}
            </Text>
            <Stack gap="sm">
              {linkedProviders.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  isConfigured={true}
                  settings={getProviderSettings(provider)}
                  onSave={(providerSettings) => handleProviderSave(provider, providerSettings)}
                  onDisconnect={() => handleProviderDisconnect(provider)}
                  disabled={!loginEnabled}
                />
              ))}
            </Stack>
          </div>

          {/* Divider between sections */}
          {availableProviders.length > 0 && <Divider />}
        </>
      )}

      {/* Unlinked Services Section */}
      {availableProviders.length > 0 && (
        <div>
          <Text fw={600} size="md" mb="md">
            {t('admin.settings.connections.unlinkedServices', 'Unlinked Services')}
          </Text>
          <Stack gap="sm">
            {availableProviders.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                isConfigured={false}
                settings={getProviderSettings(provider)}
                onSave={(providerSettings) => handleProviderSave(provider, providerSettings)}
                disabled={!loginEnabled}
              />
            ))}
          </Stack>
        </div>
      )}

      {/* Restart Confirmation Modal */}
      <RestartConfirmationModal
        opened={restartModalOpened}
        onClose={closeRestartModal}
        onRestart={restartServer}
      />
    </Stack>
  );
}
