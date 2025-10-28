import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NumberInput, Switch, Button, Stack, Paper, Text, Loader, Group, Select, Alert, Badge, Accordion, Textarea } from '@mantine/core';
import { alert } from '@app/components/toast';
import LocalIcon from '@app/components/shared/LocalIcon';
import RestartConfirmationModal from '@app/components/shared/config/RestartConfirmationModal';
import { useRestartServer } from '@app/components/shared/config/useRestartServer';
import { useAdminSettings } from '@app/hooks/useAdminSettings';
import PendingBadge from '@app/components/shared/config/PendingBadge';
import apiClient from '@app/services/apiClient';

interface SecuritySettingsData {
  enableLogin?: boolean;
  csrfDisabled?: boolean;
  loginMethod?: string;
  loginAttemptCount?: number;
  loginResetTimeMinutes?: number;
  jwt?: {
    persistence?: boolean;
    enableKeyRotation?: boolean;
    enableKeyCleanup?: boolean;
    keyRetentionDays?: number;
    secureCookie?: boolean;
  };
  audit?: {
    enabled?: boolean;
    level?: number;
    retentionDays?: number;
  };
  html?: {
    urlSecurity?: {
      enabled?: boolean;
      level?: string;
      allowedDomains?: string[];
      blockedDomains?: string[];
      internalTlds?: string[];
      blockPrivateNetworks?: boolean;
      blockLocalhost?: boolean;
      blockLinkLocal?: boolean;
      blockCloudMetadata?: boolean;
    };
  };
}

export default function AdminSecuritySection() {
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
  } = useAdminSettings<SecuritySettingsData>({
    sectionName: 'security',
    fetchTransformer: async () => {
      const [securityResponse, premiumResponse, systemResponse] = await Promise.all([
        apiClient.get('/api/v1/admin/settings/section/security'),
        apiClient.get('/api/v1/admin/settings/section/premium'),
        apiClient.get('/api/v1/admin/settings/section/system')
      ]);

      const securityData = securityResponse.data || {};
      const premiumData = premiumResponse.data || {};
      const systemData = systemResponse.data || {};

      const { _pending: securityPending, ...securityActive } = securityData;
      const { _pending: premiumPending, ...premiumActive } = premiumData;
      const { _pending: systemPending, ...systemActive } = systemData;

      const combined: any = {
        ...securityActive,
        audit: premiumActive.enterpriseFeatures?.audit || {
          enabled: false,
          level: 2,
          retentionDays: 90
        },
        html: systemActive.html || {
          urlSecurity: {
            enabled: true,
            level: 'MEDIUM',
            allowedDomains: [],
            blockedDomains: [],
            internalTlds: ['.local', '.internal', '.corp', '.home'],
            blockPrivateNetworks: true,
            blockLocalhost: true,
            blockLinkLocal: true,
            blockCloudMetadata: true
          }
        }
      };

      // Merge all _pending blocks
      const mergedPending: any = {};
      if (securityPending) {
        Object.assign(mergedPending, securityPending);
      }
      if (premiumPending?.enterpriseFeatures?.audit) {
        mergedPending.audit = premiumPending.enterpriseFeatures.audit;
      }
      if (systemPending?.html) {
        mergedPending.html = systemPending.html;
      }

      if (Object.keys(mergedPending).length > 0) {
        combined._pending = mergedPending;
      }

      return combined;
    },
    saveTransformer: (settings) => {
      const { audit, html, ...securitySettings } = settings;

      const deltaSettings: Record<string, any> = {
        'premium.enterpriseFeatures.audit.enabled': audit?.enabled,
        'premium.enterpriseFeatures.audit.level': audit?.level,
        'premium.enterpriseFeatures.audit.retentionDays': audit?.retentionDays
      };

      if (html?.urlSecurity) {
        deltaSettings['system.html.urlSecurity.enabled'] = html.urlSecurity.enabled;
        deltaSettings['system.html.urlSecurity.level'] = html.urlSecurity.level;
        deltaSettings['system.html.urlSecurity.allowedDomains'] = html.urlSecurity.allowedDomains;
        deltaSettings['system.html.urlSecurity.blockedDomains'] = html.urlSecurity.blockedDomains;
        deltaSettings['system.html.urlSecurity.internalTlds'] = html.urlSecurity.internalTlds;
        deltaSettings['system.html.urlSecurity.blockPrivateNetworks'] = html.urlSecurity.blockPrivateNetworks;
        deltaSettings['system.html.urlSecurity.blockLocalhost'] = html.urlSecurity.blockLocalhost;
        deltaSettings['system.html.urlSecurity.blockLinkLocal'] = html.urlSecurity.blockLinkLocal;
        deltaSettings['system.html.urlSecurity.blockCloudMetadata'] = html.urlSecurity.blockCloudMetadata;
      }

      return {
        sectionData: securitySettings,
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
        <Text fw={600} size="lg">{t('admin.settings.security.title', 'Security')}</Text>
        <Text size="sm" c="dimmed">
          {t('admin.settings.security.description', 'Configure authentication, login behaviour, and security policies.')}
        </Text>
      </div>

      {/* Authentication Settings */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Text fw={600} size="sm" mb="xs">{t('admin.settings.security.authentication', 'Authentication')}</Text>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.security.enableLogin', 'Enable Login')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.security.enableLogin.description', 'Require users to log in before accessing the application')}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings.enableLogin || false}
                onChange={(e) => setSettings({ ...settings, enableLogin: e.target.checked })}
              />
              <PendingBadge show={isFieldPending('enableLogin')} />
            </Group>
          </div>

          <div>
            <Select
              label={t('admin.settings.security.loginMethod', 'Login Method')}
              description={t('admin.settings.security.loginMethod.description', 'The authentication method to use for user login')}
              value={settings.loginMethod || 'all'}
              onChange={(value) => setSettings({ ...settings, loginMethod: value || 'all' })}
              data={[
                { value: 'all', label: t('admin.settings.security.loginMethod.all', 'All Methods') },
                { value: 'normal', label: t('admin.settings.security.loginMethod.normal', 'Username/Password Only') },
                { value: 'oauth2', label: t('admin.settings.security.loginMethod.oauth2', 'OAuth2 Only') },
                { value: 'saml2', label: t('admin.settings.security.loginMethod.saml2', 'SAML2 Only') },
              ]}
              comboboxProps={{ zIndex: 1400 }}
            />
            {isFieldPending('loginMethod') && (
              <Group mt="xs">
                <PendingBadge show={true} />
              </Group>
            )}
          </div>

          <div>
            <NumberInput
              label={t('admin.settings.security.loginAttemptCount', 'Login Attempt Limit')}
              description={t('admin.settings.security.loginAttemptCount.description', 'Maximum number of failed login attempts before account lockout')}
              value={settings.loginAttemptCount || 0}
              onChange={(value) => setSettings({ ...settings, loginAttemptCount: Number(value) })}
              min={0}
              max={100}
            />
          </div>

          <div>
            <NumberInput
              label={t('admin.settings.security.loginResetTimeMinutes', 'Login Reset Time (minutes)')}
              description={t('admin.settings.security.loginResetTimeMinutes.description', 'Time before failed login attempts are reset')}
              value={settings.loginResetTimeMinutes || 0}
              onChange={(value) => setSettings({ ...settings, loginResetTimeMinutes: Number(value) })}
              min={0}
              max={1440}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.security.csrfDisabled', 'Disable CSRF Protection')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.security.csrfDisabled.description', 'Disable Cross-Site Request Forgery protection (not recommended)')}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings.csrfDisabled || false}
                onChange={(e) => setSettings({ ...settings, csrfDisabled: e.target.checked })}
              />
              <PendingBadge show={isFieldPending('csrfDisabled')} />
            </Group>
          </div>
        </Stack>
      </Paper>

      {/* SSO/SAML Notice */}
      <Alert
        variant="light"
        color="blue"
        title={t('admin.settings.security.ssoNotice.title', 'Looking for SSO/SAML settings?')}
        icon={<LocalIcon icon="info-rounded" width="1rem" height="1rem" />}
      >
        <Text size="sm">
          {t('admin.settings.security.ssoNotice.message', 'OAuth2 and SAML2 authentication providers have been moved to the Connections menu for easier management.')}
        </Text>
      </Alert>

      {/* JWT Settings */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Text fw={600} size="sm" mb="xs">{t('admin.settings.security.jwt', 'JWT Configuration')}</Text>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.security.jwt.persistence', 'Enable Key Persistence')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.security.jwt.persistence.description', 'Store JWT keys persistently (required for multi-instance deployments)')}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings.jwt?.persistence || false}
                onChange={(e) => setSettings({ ...settings, jwt: { ...settings.jwt, persistence: e.target.checked } })}
              />
              <PendingBadge show={isFieldPending('jwt.persistence')} />
            </Group>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.security.jwt.enableKeyRotation', 'Enable Key Rotation')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.security.jwt.enableKeyRotation.description', 'Automatically rotate JWT signing keys for improved security')}
              </Text>
            </div>
            <Switch
              checked={settings.jwt?.enableKeyRotation || false}
              onChange={(e) => setSettings({ ...settings, jwt: { ...settings.jwt, enableKeyRotation: e.target.checked } })}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.security.jwt.enableKeyCleanup', 'Enable Key Cleanup')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.security.jwt.enableKeyCleanup.description', 'Automatically remove old JWT keys after retention period')}
              </Text>
            </div>
            <Switch
              checked={settings.jwt?.enableKeyCleanup || false}
              onChange={(e) => setSettings({ ...settings, jwt: { ...settings.jwt, enableKeyCleanup: e.target.checked } })}
            />
          </div>

          <div>
            <NumberInput
              label={t('admin.settings.security.jwt.keyRetentionDays', 'Key Retention Days')}
              description={t('admin.settings.security.jwt.keyRetentionDays.description', 'Number of days to retain old JWT keys for verification')}
              value={settings.jwt?.keyRetentionDays || 7}
              onChange={(value) => setSettings({ ...settings, jwt: { ...settings.jwt, keyRetentionDays: Number(value) } })}
              min={1}
              max={365}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.security.jwt.secureCookie', 'Secure Cookie')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.security.jwt.secureCookie.description', 'Require HTTPS for JWT cookies (recommended for production)')}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings.jwt?.secureCookie || false}
                onChange={(e) => setSettings({ ...settings, jwt: { ...settings.jwt, secureCookie: e.target.checked } })}
              />
              <PendingBadge show={isFieldPending('jwt.secureCookie')} />
            </Group>
          </div>
        </Stack>
      </Paper>

      {/* Audit Logging - Enterprise Feature */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Text fw={600} size="sm">{t('admin.settings.security.audit', 'Audit Logging')}</Text>
            <Badge color="grape" size="sm">ENTERPRISE</Badge>
          </Group>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.security.audit.enabled', 'Enable Audit Logging')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.security.audit.enabled.description', 'Track user actions and system events for compliance and security monitoring')}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings.audit?.enabled || false}
                onChange={(e) => setSettings({ ...settings, audit: { ...settings.audit, enabled: e.target.checked } })}
              />
              <PendingBadge show={isFieldPending('audit.enabled')} />
            </Group>
          </div>

          <div>
            <NumberInput
              label={t('admin.settings.security.audit.level', 'Audit Level')}
              description={t('admin.settings.security.audit.level.description', '0=OFF, 1=BASIC, 2=STANDARD, 3=VERBOSE')}
              value={settings.audit?.level || 2}
              onChange={(value) => setSettings({ ...settings, audit: { ...settings.audit, level: Number(value) } })}
              min={0}
              max={3}
            />
          </div>

          <div>
            <NumberInput
              label={t('admin.settings.security.audit.retentionDays', 'Audit Retention (days)')}
              description={t('admin.settings.security.audit.retentionDays.description', 'Number of days to retain audit logs')}
              value={settings.audit?.retentionDays || 90}
              onChange={(value) => setSettings({ ...settings, audit: { ...settings.audit, retentionDays: Number(value) } })}
              min={1}
              max={3650}
            />
          </div>
        </Stack>
      </Paper>

      {/* HTML URL Security */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <div>
            <Text fw={600} size="sm" mb="xs">{t('admin.settings.security.htmlUrlSecurity', 'HTML URL Security')}</Text>
            <Text size="xs" c="dimmed">
              {t('admin.settings.security.htmlUrlSecurity.description', 'Configure URL access restrictions for HTML processing to prevent SSRF attacks')}
            </Text>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.security.htmlUrlSecurity.enabled', 'Enable URL Security')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.security.htmlUrlSecurity.enabled.description', 'Enable URL security restrictions for HTML to PDF conversions')}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings.html?.urlSecurity?.enabled || false}
                onChange={(e) => setSettings({
                  ...settings,
                  html: {
                    ...settings.html,
                    urlSecurity: { ...settings.html?.urlSecurity, enabled: e.target.checked }
                  }
                })}
              />
              <PendingBadge show={isFieldPending('html.urlSecurity.enabled')} />
            </Group>
          </div>

          <div>
            <Select
              label={t('admin.settings.security.htmlUrlSecurity.level', 'Security Level')}
              description={t('admin.settings.security.htmlUrlSecurity.level.description', 'MAX: whitelist only, MEDIUM: block internal networks, OFF: no restrictions')}
              value={settings.html?.urlSecurity?.level || 'MEDIUM'}
              onChange={(value) => setSettings({
                ...settings,
                html: {
                  ...settings.html,
                  urlSecurity: { ...settings.html?.urlSecurity, level: value || 'MEDIUM' }
                }
              })}
              data={[
                { value: 'MAX', label: t('admin.settings.security.htmlUrlSecurity.level.max', 'Maximum (Whitelist Only)') },
                { value: 'MEDIUM', label: t('admin.settings.security.htmlUrlSecurity.level.medium', 'Medium (Block Internal)') },
                { value: 'OFF', label: t('admin.settings.security.htmlUrlSecurity.level.off', 'Off (No Restrictions)') },
              ]}
              comboboxProps={{ zIndex: 1400 }}
            />
          </div>

          <Accordion variant="separated">
            <Accordion.Item value="advanced">
              <Accordion.Control>{t('admin.settings.security.htmlUrlSecurity.advanced', 'Advanced Settings')}</Accordion.Control>
              <Accordion.Panel>
                <Stack gap="md">
                  {/* Allowed Domains */}
                  <div>
                    <Textarea
                      label={t('admin.settings.security.htmlUrlSecurity.allowedDomains', 'Allowed Domains (Whitelist)')}
                      description={t('admin.settings.security.htmlUrlSecurity.allowedDomains.description', 'One domain per line (e.g., cdn.example.com). Only these domains allowed when level is MAX')}
                      value={settings.html?.urlSecurity?.allowedDomains?.join('\n') || ''}
                      onChange={(e) => setSettings({
                        ...settings,
                        html: {
                          ...settings.html,
                          urlSecurity: {
                            ...settings.html?.urlSecurity,
                            allowedDomains: e.target.value ? e.target.value.split('\n').filter(d => d.trim()) : []
                          }
                        }
                      })}
                      placeholder="cdn.example.com&#10;images.google.com"
                      minRows={3}
                      autosize
                    />
                  </div>

                  {/* Blocked Domains */}
                  <div>
                    <Textarea
                      label={t('admin.settings.security.htmlUrlSecurity.blockedDomains', 'Blocked Domains (Blacklist)')}
                      description={t('admin.settings.security.htmlUrlSecurity.blockedDomains.description', 'One domain per line (e.g., malicious.com). Additional domains to block')}
                      value={settings.html?.urlSecurity?.blockedDomains?.join('\n') || ''}
                      onChange={(e) => setSettings({
                        ...settings,
                        html: {
                          ...settings.html,
                          urlSecurity: {
                            ...settings.html?.urlSecurity,
                            blockedDomains: e.target.value ? e.target.value.split('\n').filter(d => d.trim()) : []
                          }
                        }
                      })}
                      placeholder="malicious.com&#10;evil.org"
                      minRows={3}
                      autosize
                    />
                  </div>

                  {/* Internal TLDs */}
                  <div>
                    <Textarea
                      label={t('admin.settings.security.htmlUrlSecurity.internalTlds', 'Internal TLDs')}
                      description={t('admin.settings.security.htmlUrlSecurity.internalTlds.description', 'One TLD per line (e.g., .local, .internal). Block domains with these TLD patterns')}
                      value={settings.html?.urlSecurity?.internalTlds?.join('\n') || ''}
                      onChange={(e) => setSettings({
                        ...settings,
                        html: {
                          ...settings.html,
                          urlSecurity: {
                            ...settings.html?.urlSecurity,
                            internalTlds: e.target.value ? e.target.value.split('\n').filter(d => d.trim()) : []
                          }
                        }
                      })}
                      placeholder=".local&#10;.internal&#10;.corp&#10;.home"
                      minRows={3}
                      autosize
                    />
                  </div>

                  {/* Network Blocking Options */}
                  <Text fw={600} size="sm" mt="md">{t('admin.settings.security.htmlUrlSecurity.networkBlocking', 'Network Blocking')}</Text>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <Text fw={500} size="sm">{t('admin.settings.security.htmlUrlSecurity.blockPrivateNetworks', 'Block Private Networks')}</Text>
                      <Text size="xs" c="dimmed" mt={4}>
                        {t('admin.settings.security.htmlUrlSecurity.blockPrivateNetworks.description', 'Block RFC 1918 private networks (10.x.x.x, 192.168.x.x, 172.16-31.x.x)')}
                      </Text>
                    </div>
                    <Switch
                      checked={settings.html?.urlSecurity?.blockPrivateNetworks || false}
                      onChange={(e) => setSettings({
                        ...settings,
                        html: {
                          ...settings.html,
                          urlSecurity: { ...settings.html?.urlSecurity, blockPrivateNetworks: e.target.checked }
                        }
                      })}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <Text fw={500} size="sm">{t('admin.settings.security.htmlUrlSecurity.blockLocalhost', 'Block Localhost')}</Text>
                      <Text size="xs" c="dimmed" mt={4}>
                        {t('admin.settings.security.htmlUrlSecurity.blockLocalhost.description', 'Block localhost and loopback addresses (127.x.x.x, ::1)')}
                      </Text>
                    </div>
                    <Switch
                      checked={settings.html?.urlSecurity?.blockLocalhost || false}
                      onChange={(e) => setSettings({
                        ...settings,
                        html: {
                          ...settings.html,
                          urlSecurity: { ...settings.html?.urlSecurity, blockLocalhost: e.target.checked }
                        }
                      })}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <Text fw={500} size="sm">{t('admin.settings.security.htmlUrlSecurity.blockLinkLocal', 'Block Link-Local Addresses')}</Text>
                      <Text size="xs" c="dimmed" mt={4}>
                        {t('admin.settings.security.htmlUrlSecurity.blockLinkLocal.description', 'Block link-local addresses (169.254.x.x, fe80::/10)')}
                      </Text>
                    </div>
                    <Switch
                      checked={settings.html?.urlSecurity?.blockLinkLocal || false}
                      onChange={(e) => setSettings({
                        ...settings,
                        html: {
                          ...settings.html,
                          urlSecurity: { ...settings.html?.urlSecurity, blockLinkLocal: e.target.checked }
                        }
                      })}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <Text fw={500} size="sm">{t('admin.settings.security.htmlUrlSecurity.blockCloudMetadata', 'Block Cloud Metadata Endpoints')}</Text>
                      <Text size="xs" c="dimmed" mt={4}>
                        {t('admin.settings.security.htmlUrlSecurity.blockCloudMetadata.description', 'Block cloud provider metadata endpoints (169.254.169.254)')}
                      </Text>
                    </div>
                    <Switch
                      checked={settings.html?.urlSecurity?.blockCloudMetadata || false}
                      onChange={(e) => setSettings({
                        ...settings,
                        html: {
                          ...settings.html,
                          urlSecurity: { ...settings.html?.urlSecurity, blockCloudMetadata: e.target.checked }
                        }
                      })}
                    />
                  </div>
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
