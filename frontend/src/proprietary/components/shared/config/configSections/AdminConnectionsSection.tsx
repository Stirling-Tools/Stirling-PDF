import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Stack,
  Text,
  Loader,
  Group,
  Divider,
  Paper,
  Switch,
  Badge,
  Anchor,
  Select,
  Collapse,
} from "@mantine/core";
import { alert } from "@app/components/toast";
import LocalIcon from "@app/components/shared/LocalIcon";
import RestartConfirmationModal from "@app/components/shared/config/RestartConfirmationModal";
import { useRestartServer } from "@app/components/shared/config/useRestartServer";
import { useAdminSettings } from "@app/hooks/useAdminSettings";
import { useSettingsDirty } from "@app/hooks/useSettingsDirty";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import { SettingsStickyFooter } from "@app/components/shared/config/SettingsStickyFooter";
import { Z_INDEX_CONFIG_MODAL } from "@app/styles/zIndex";
import ProviderCard from "@app/components/shared/config/configSections/ProviderCard";
import {
  Provider,
  useAllProviders,
} from "@app/components/shared/config/configSections/providerDefinitions";
import apiClient from "@app/services/apiClient";
import { useLoginRequired } from "@app/hooks/useLoginRequired";
import LoginRequiredBanner from "@app/components/shared/config/LoginRequiredBanner";

interface FeedbackFlags {
  noValidDocument?: boolean;
  errorProcessing?: boolean;
  errorMessage?: boolean;
}

interface FeedbackSettings {
  general?: { enabled?: boolean };
  channel?: FeedbackFlags;
  user?: FeedbackFlags;
}

interface TelegramSettingsData {
  enabled?: boolean;
  botToken?: string;
  botUsername?: string;
  pipelineInboxFolder?: string;
  customFolderSuffix?: boolean;
  enableAllowUserIDs?: boolean;
  allowUserIDs?: number[];
  enableAllowChannelIDs?: boolean;
  allowChannelIDs?: number[];
  processingTimeoutSeconds?: number;
  pollingIntervalMillis?: number;
  feedback?: FeedbackSettings;
}

interface MailSettings {
  enabled?: boolean;
  enableInvites?: boolean;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  from?: string;
}

interface GoogleDriveSettings {
  enabled?: boolean;
  clientId?: string;
  apiKey?: string;
  appId?: string;
}

interface OAuth2GenericSettings {
  enabled?: boolean;
  provider?: string;
  issuer?: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string;
  useAsUsername?: string;
  autoCreateUser?: boolean;
  blockRegistration?: boolean;
}

interface Saml2Settings {
  enabled?: boolean;
  provider?: string;
  registrationId?: string;
  idpMetadataUri?: string;
  idpSingleLoginUrl?: string;
  idpSingleLogoutUrl?: string;
  idpIssuer?: string;
  idpCert?: string;
  privateKey?: string;
  spCert?: string;
  autoCreateUser?: boolean;
  blockRegistration?: boolean;
}

interface OAuth2ClientSettings {
  clientId?: string;
  clientSecret?: string;
  scopes?: string;
  useAsUsername?: string;
  issuer?: string;
}

type ProviderSettings =
  | MailSettings
  | TelegramSettingsData
  | GoogleDriveSettings
  | OAuth2GenericSettings
  | Saml2Settings
  | OAuth2ClientSettings;

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
    client?: Record<string, OAuth2ClientSettings>;
  };
  saml2?: Saml2Settings;
  mail?: MailSettings;
  telegram?: TelegramSettingsData;
  ssoAutoLogin?: boolean;
  enableMobileScanner?: boolean;
  mobileScannerConvertToPdf?: boolean;
  mobileScannerImageResolution?: string;
  mobileScannerPageFormat?: string;
  mobileScannerStretchToFit?: boolean;
  googleDriveEnabled?: boolean;
  googleDriveClientId?: string;
  googleDriveApiKey?: string;
  googleDriveAppId?: string;
}

export default function AdminConnectionsSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { loginEnabled, getDisabledStyles } = useLoginRequired();
  const { restartModalOpened, closeRestartModal, restartServer } =
    useRestartServer();
  const allProviders = useAllProviders();

  const adminSettings = useAdminSettings<ConnectionsSettingsData>({
    sectionName: "connections",
    fetchTransformer: async (): Promise<
      ConnectionsSettingsData & { _pending?: Record<string, unknown> }
    > => {
      // Fetch security settings (oauth2, saml2)
      const securityResponse = await apiClient.get(
        "/api/v1/admin/settings/section/security",
      );
      const securityData = securityResponse.data || {};

      // Fetch mail settings
      const mailResponse = await apiClient.get(
        "/api/v1/admin/settings/section/mail",
      );
      const mailData = mailResponse.data || {};

      // Fetch premium settings for SSO Auto Login
      const premiumResponse = await apiClient.get(
        "/api/v1/admin/settings/section/premium",
      );
      const premiumData = premiumResponse.data || {};

      // Fetch Telegram settings
      const telegramResponse = await apiClient.get(
        "/api/v1/admin/settings/section/telegram",
      );
      const telegramData = telegramResponse.data || {};

      // Fetch system settings for enableMobileScanner
      const systemResponse = await apiClient.get(
        "/api/v1/admin/settings/section/system",
      );
      const systemData = systemResponse.data || {};

      const result: ConnectionsSettingsData & {
        _pending?: Record<string, unknown>;
      } = {
        oauth2: securityData.oauth2 || {},
        saml2: securityData.saml2 || {},
        mail: mailData || {},
        telegram: telegramData || {},
        ssoAutoLogin: premiumData.proFeatures?.ssoAutoLogin || false,
        enableMobileScanner: systemData.enableMobileScanner || false,
        mobileScannerConvertToPdf:
          systemData.mobileScannerSettings?.convertToPdf !== false,
        mobileScannerImageResolution:
          systemData.mobileScannerSettings?.imageResolution || "full",
        mobileScannerPageFormat:
          systemData.mobileScannerSettings?.pageFormat || "A4",
        mobileScannerStretchToFit:
          systemData.mobileScannerSettings?.stretchToFit || false,
        googleDriveEnabled:
          premiumData.proFeatures?.googleDrive?.enabled || false,
        googleDriveClientId:
          premiumData.proFeatures?.googleDrive?.clientId || "",
        googleDriveApiKey: premiumData.proFeatures?.googleDrive?.apiKey || "",
        googleDriveAppId: premiumData.proFeatures?.googleDrive?.appId || "",
      };

      // Merge pending blocks from all endpoints
      const pendingBlock: Record<string, unknown> = {};
      if (securityData._pending?.oauth2) {
        pendingBlock.oauth2 = securityData._pending.oauth2;
      }
      if (securityData._pending?.saml2) {
        pendingBlock.saml2 = securityData._pending.saml2;
      }
      if (mailData._pending) {
        pendingBlock.mail = mailData._pending;
      }
      if (telegramData._pending) {
        pendingBlock.telegram = telegramData._pending;
      }
      if (premiumData._pending?.proFeatures?.ssoAutoLogin !== undefined) {
        pendingBlock.ssoAutoLogin =
          premiumData._pending.proFeatures.ssoAutoLogin;
      }
      if (systemData._pending?.enableMobileScanner !== undefined) {
        pendingBlock.enableMobileScanner =
          systemData._pending.enableMobileScanner;
      }
      if (
        systemData._pending?.mobileScannerSettings?.convertToPdf !== undefined
      ) {
        pendingBlock.mobileScannerConvertToPdf =
          systemData._pending.mobileScannerSettings.convertToPdf;
      }
      if (
        systemData._pending?.mobileScannerSettings?.imageResolution !==
        undefined
      ) {
        pendingBlock.mobileScannerImageResolution =
          systemData._pending.mobileScannerSettings.imageResolution;
      }
      if (
        systemData._pending?.mobileScannerSettings?.pageFormat !== undefined
      ) {
        pendingBlock.mobileScannerPageFormat =
          systemData._pending.mobileScannerSettings.pageFormat;
      }
      if (
        systemData._pending?.mobileScannerSettings?.stretchToFit !== undefined
      ) {
        pendingBlock.mobileScannerStretchToFit =
          systemData._pending.mobileScannerSettings.stretchToFit;
      }
      if (
        premiumData._pending?.proFeatures?.googleDrive?.enabled !== undefined
      ) {
        pendingBlock.googleDriveEnabled =
          premiumData._pending.proFeatures.googleDrive.enabled;
      }
      if (
        premiumData._pending?.proFeatures?.googleDrive?.clientId !== undefined
      ) {
        pendingBlock.googleDriveClientId =
          premiumData._pending.proFeatures.googleDrive.clientId;
      }
      if (
        premiumData._pending?.proFeatures?.googleDrive?.apiKey !== undefined
      ) {
        pendingBlock.googleDriveApiKey =
          premiumData._pending.proFeatures.googleDrive.apiKey;
      }
      if (premiumData._pending?.proFeatures?.googleDrive?.appId !== undefined) {
        pendingBlock.googleDriveAppId =
          premiumData._pending.proFeatures.googleDrive.appId;
      }

      if (Object.keys(pendingBlock).length > 0) {
        result._pending = pendingBlock;
      }

      return result;
    },
    saveTransformer: (currentSettings: ConnectionsSettingsData) => {
      const deltaSettings: Record<string, unknown> = {};

      // Build delta for oauth2 settings
      if (currentSettings.oauth2) {
        Object.keys(currentSettings.oauth2).forEach((key) => {
          if (key !== "client") {
            deltaSettings[`security.oauth2.${key}`] = (
              currentSettings.oauth2 as Record<string, unknown>
            )[key];
          }
        });

        // Build delta for specific OAuth2 providers
        const oauth2Client = currentSettings.oauth2.client;
        if (oauth2Client) {
          Object.keys(oauth2Client).forEach((providerId) => {
            const providerSettings = oauth2Client[providerId] as Record<
              string,
              unknown
            >;
            Object.keys(providerSettings).forEach((key) => {
              deltaSettings[`security.oauth2.client.${providerId}.${key}`] =
                providerSettings[key];
            });
          });
        }
      }

      // Build delta for saml2 settings
      if (currentSettings.saml2) {
        const saml2 = currentSettings.saml2 as Record<string, unknown>;
        Object.keys(saml2).forEach((key) => {
          deltaSettings[`security.saml2.${key}`] = saml2[key];
        });
      }

      // Mail settings
      if (currentSettings.mail) {
        const mail = currentSettings.mail as Record<string, unknown>;
        Object.keys(mail).forEach((key) => {
          deltaSettings[`mail.${key}`] = mail[key];
        });
      }

      // Telegram settings
      if (currentSettings.telegram) {
        const telegram = currentSettings.telegram as Record<string, unknown>;
        Object.keys(telegram).forEach((key) => {
          deltaSettings[`telegram.${key}`] = telegram[key];
        });
      }

      // SSO Auto Login
      if (currentSettings?.ssoAutoLogin !== undefined) {
        deltaSettings["premium.proFeatures.ssoAutoLogin"] =
          currentSettings.ssoAutoLogin;
      }

      // Mobile Scanner settings
      if (currentSettings?.enableMobileScanner !== undefined) {
        deltaSettings["system.enableMobileScanner"] =
          currentSettings.enableMobileScanner;
      }
      if (currentSettings?.mobileScannerConvertToPdf !== undefined) {
        deltaSettings["system.mobileScannerSettings.convertToPdf"] =
          currentSettings.mobileScannerConvertToPdf;
      }
      if (currentSettings?.mobileScannerImageResolution !== undefined) {
        deltaSettings["system.mobileScannerSettings.imageResolution"] =
          currentSettings.mobileScannerImageResolution;
      }
      if (currentSettings?.mobileScannerPageFormat !== undefined) {
        deltaSettings["system.mobileScannerSettings.pageFormat"] =
          currentSettings.mobileScannerPageFormat;
      }
      if (currentSettings?.mobileScannerStretchToFit !== undefined) {
        deltaSettings["system.mobileScannerSettings.stretchToFit"] =
          currentSettings.mobileScannerStretchToFit;
      }

      // Google Drive settings
      if (currentSettings?.googleDriveEnabled !== undefined) {
        deltaSettings["premium.proFeatures.googleDrive.enabled"] =
          currentSettings.googleDriveEnabled;
      }
      if (currentSettings?.googleDriveClientId !== undefined) {
        deltaSettings["premium.proFeatures.googleDrive.clientId"] =
          currentSettings.googleDriveClientId;
      }
      if (currentSettings?.googleDriveApiKey !== undefined) {
        deltaSettings["premium.proFeatures.googleDrive.apiKey"] =
          currentSettings.googleDriveApiKey;
      }
      if (currentSettings?.googleDriveAppId !== undefined) {
        deltaSettings["premium.proFeatures.googleDrive.appId"] =
          currentSettings.googleDriveAppId;
      }

      return {
        sectionData: {},
        deltaSettings,
      };
    },
  });

  const { settings, setSettings, loading, fetchSettings, isFieldPending } =
    adminSettings;

  useEffect(() => {
    if (loginEnabled) {
      fetchSettings();
    }
  }, [loginEnabled, fetchSettings]);

  const { isDirty, resetToSnapshot, markSaved } = useSettingsDirty(
    settings,
    loading,
  );

  const handleDiscard = useCallback(() => {
    const original = resetToSnapshot();
    setSettings(original);
  }, [resetToSnapshot, setSettings]);

  const handleSave = async () => {
    markSaved();
    try {
      await adminSettings.saveSettings();
    } catch (_error) {
      alert({
        alertType: "error",
        title: t("admin.error", "Error"),
        body: t("admin.settings.saveError", "Failed to save settings"),
      });
    }
  };

  // Override loading state when login is disabled
  const actualLoading = loginEnabled ? loading : false;

  const isProviderConfigured = (provider: Provider): boolean => {
    if (provider.id === "saml2") {
      return settings?.saml2?.enabled === true;
    }

    if (provider.id === "smtp") {
      return settings?.mail?.enabled === true;
    }

    if (provider.id === "telegram") {
      return settings?.telegram?.enabled === true;
    }

    if (provider.id === "googledrive") {
      return settings?.googleDriveEnabled === true;
    }

    if (provider.id === "oauth2-generic") {
      return settings?.oauth2?.enabled === true;
    }

    // Check if specific OAuth2 provider is configured (has clientId)
    const providerSettings = settings?.oauth2?.client?.[provider.id];
    return !!providerSettings?.clientId;
  };

  const getProviderSettings = (provider: Provider): ProviderSettings => {
    if (provider.id === "saml2") {
      return settings?.saml2 || {};
    }

    if (provider.id === "smtp") {
      return settings?.mail || {};
    }

    if (provider.id === "telegram") {
      return settings?.telegram || {};
    }

    if (provider.id === "googledrive") {
      const gd: GoogleDriveSettings = {
        enabled: settings?.googleDriveEnabled,
        clientId: settings?.googleDriveClientId,
        apiKey: settings?.googleDriveApiKey,
        appId: settings?.googleDriveAppId,
      };
      return gd;
    }

    if (provider.id === "oauth2-generic") {
      const generic: OAuth2GenericSettings = {
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
      return generic;
    }

    // Specific OAuth2 provider settings
    return settings?.oauth2?.client?.[provider.id] || {};
  };

  if (actualLoading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
      </Stack>
    );
  }

  const linkedProviders = allProviders.filter((p) => isProviderConfigured(p));
  const availableProviders = allProviders.filter(
    (p) => !isProviderConfigured(p),
  );

  const updateProviderSettings = (
    provider: Provider,
    updatedSettings: Record<string, unknown>,
  ) => {
    if (provider.id === "smtp") {
      setSettings({ ...settings, mail: updatedSettings as MailSettings });
    } else if (provider.id === "telegram") {
      setSettings({
        ...settings,
        telegram: updatedSettings as TelegramSettingsData,
      });
    } else if (provider.id === "googledrive") {
      const gd = updatedSettings as GoogleDriveSettings;
      setSettings({
        ...settings,
        googleDriveEnabled: gd.enabled,
        googleDriveClientId: gd.clientId,
        googleDriveApiKey: gd.apiKey,
        googleDriveAppId: gd.appId,
      });
    } else if (provider.id === "saml2") {
      setSettings({ ...settings, saml2: updatedSettings as Saml2Settings });
    } else if (provider.id === "oauth2-generic") {
      const generic = updatedSettings as OAuth2GenericSettings;
      setSettings({ ...settings, oauth2: { ...settings.oauth2, ...generic } });
    } else {
      // Specific OAuth2 provider
      const clientSettings = updatedSettings as OAuth2ClientSettings;
      setSettings({
        ...settings,
        oauth2: {
          ...settings.oauth2,
          client: {
            ...settings.oauth2?.client,
            [provider.id]: clientSettings,
          },
        },
      });
    }
  };

  return (
    <div className="settings-section-container">
      <Stack gap="xl" className="settings-section-content">
        <LoginRequiredBanner show={!loginEnabled} />

        {/* Header */}
        <div>
          <Text fw={600} size="lg">
            {t("admin.settings.connections.title", "Connections")}
          </Text>
          <Text size="sm" c="dimmed">
            {t(
              "admin.settings.connections.description",
              "Configure external authentication providers like OAuth2 and SAML.",
            )}
          </Text>
        </div>

        {/* SSO Auto Login - Premium Feature */}
        <Paper withBorder p="md" radius="md">
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Text fw={600} size="sm">
                {t(
                  "admin.settings.connections.ssoAutoLogin.label",
                  "SSO Auto Login",
                )}
              </Text>
              <Badge
                color="grape"
                size="sm"
                style={{ cursor: "pointer" }}
                onClick={() => navigate("/settings/adminPlan")}
                title={t(
                  "admin.settings.badge.clickToUpgrade",
                  "Click to view plan details",
                )}
              >
                PRO
              </Badge>
            </Group>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <Text fw={500} size="sm">
                  {t(
                    "admin.settings.connections.ssoAutoLogin.enable",
                    "Enable SSO Auto Login",
                  )}
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  {t(
                    "admin.settings.connections.ssoAutoLogin.description",
                    "Automatically redirect to SSO login when authentication is required",
                  )}
                </Text>
              </div>
              <Group gap="xs">
                <Switch
                  checked={settings?.ssoAutoLogin || false}
                  onChange={(e) => {
                    if (!loginEnabled) return; // Block change when login disabled
                    setSettings({
                      ...settings,
                      ssoAutoLogin: e.target.checked,
                    });
                  }}
                  disabled={!loginEnabled}
                  styles={getDisabledStyles()}
                />
                <PendingBadge show={isFieldPending("ssoAutoLogin")} />
              </Group>
            </div>
          </Stack>
        </Paper>

        {/* Mobile Scanner (QR Code) Upload */}
        <Paper withBorder p="md" radius="md">
          <Stack gap="md">
            <Group gap="xs" align="center">
              <LocalIcon
                icon="qr-code-rounded"
                width="1.25rem"
                height="1.25rem"
              />
              <Text fw={600} size="sm">
                {t(
                  "admin.settings.connections.mobileScanner.label",
                  "Mobile Phone Upload",
                )}
              </Text>
            </Group>

            {/* Documentation Link */}
            <Anchor
              href="https://docs.stirlingpdf.com/Functionality/Mobile-Scanner"
              target="_blank"
              size="xs"
              c="blue"
            >
              {t(
                "admin.settings.connections.documentation",
                "View documentation",
              )}{" "}
              ↗
            </Anchor>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <Text fw={500} size="sm">
                  {t(
                    "admin.settings.connections.mobileScanner.enable",
                    "Enable QR Code Upload",
                  )}
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  {t(
                    "admin.settings.connections.mobileScanner.description",
                    "Allow users to upload files from mobile devices by scanning a QR code",
                  )}
                </Text>
                <Text size="xs" c="orange" mt={8} fw={500}>
                  {t(
                    "admin.settings.connections.mobileScanner.note",
                    "Note: Requires Frontend URL to be configured. ",
                  )}
                  <Anchor
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate("/settings/adminGeneral#frontendUrl");
                    }}
                    c="orange"
                    td="underline"
                  >
                    {t(
                      "admin.settings.connections.mobileScanner.link",
                      "Configure in System Settings",
                    )}
                  </Anchor>
                </Text>
              </div>
              <Group gap="xs">
                <Switch
                  checked={settings?.enableMobileScanner || false}
                  onChange={(e) => {
                    if (!loginEnabled) return; // Block change when login disabled
                    setSettings({
                      ...settings,
                      enableMobileScanner: e.target.checked,
                    });
                  }}
                  disabled={!loginEnabled}
                  styles={getDisabledStyles()}
                />
                <PendingBadge show={isFieldPending("enableMobileScanner")} />
              </Group>
            </div>

            {/* Mobile Scanner Settings - Only show when enabled */}
            <Collapse in={settings?.enableMobileScanner || false}>
              <Stack
                gap="md"
                mt="md"
                ml="lg"
                style={{
                  borderLeft: "2px solid var(--mantine-color-gray-3)",
                  paddingLeft: "1rem",
                }}
              >
                {/* Convert to PDF */}
                <div>
                  <Text size="sm" fw={500} mb="xs">
                    {t(
                      "admin.settings.connections.mobileScannerConvertToPdf",
                      "Convert Images to PDF",
                    )}
                  </Text>
                  <Text size="xs" c="dimmed" mb="sm">
                    {t(
                      "admin.settings.connections.mobileScannerConvertToPdfDesc",
                      "Automatically convert uploaded images to PDF format. If disabled, images will be kept as-is.",
                    )}
                  </Text>
                  <Group gap="xs">
                    <Switch
                      checked={settings?.mobileScannerConvertToPdf !== false}
                      onChange={(e) => {
                        if (!loginEnabled) return;
                        setSettings({
                          ...settings,
                          mobileScannerConvertToPdf: e.target.checked,
                        });
                      }}
                      disabled={!loginEnabled}
                    />
                    <PendingBadge
                      show={isFieldPending("mobileScannerConvertToPdf")}
                    />
                  </Group>
                </div>

                {/* PDF Conversion Settings - Only show when convertToPdf is enabled */}
                {settings?.mobileScannerConvertToPdf !== false && (
                  <>
                    {/* Image Resolution */}
                    <div>
                      <Text size="sm" fw={500} mb="xs">
                        {t(
                          "admin.settings.connections.mobileScannerImageResolution",
                          "Image Resolution",
                        )}
                      </Text>
                      <Text size="xs" c="dimmed" mb="sm">
                        {t(
                          "admin.settings.connections.mobileScannerImageResolutionDesc",
                          'Resolution of uploaded images. "Reduced" scales images to max 1200px to reduce file size.',
                        )}
                      </Text>
                      <Group gap="xs">
                        <Select
                          value={
                            settings?.mobileScannerImageResolution || "full"
                          }
                          onChange={(value) => {
                            if (!loginEnabled) return;
                            setSettings({
                              ...settings,
                              mobileScannerImageResolution: value || "full",
                            });
                          }}
                          data={[
                            {
                              value: "full",
                              label: t(
                                "admin.settings.connections.imageResolutionFull",
                                "Full (Original Size)",
                              ),
                            },
                            {
                              value: "reduced",
                              label: t(
                                "admin.settings.connections.imageResolutionReduced",
                                "Reduced (Max 1200px)",
                              ),
                            },
                          ]}
                          disabled={!loginEnabled}
                          style={{ width: "250px" }}
                          comboboxProps={{ zIndex: Z_INDEX_CONFIG_MODAL }}
                        />
                        <PendingBadge
                          show={isFieldPending("mobileScannerImageResolution")}
                        />
                      </Group>
                    </div>

                    {/* Page Format */}
                    <div>
                      <Text size="sm" fw={500} mb="xs">
                        {t(
                          "admin.settings.connections.mobileScannerPageFormat",
                          "Page Format",
                        )}
                      </Text>
                      <Text size="xs" c="dimmed" mb="sm">
                        {t(
                          "admin.settings.connections.mobileScannerPageFormatDesc",
                          'PDF page size for converted images. "Keep" uses original image dimensions.',
                        )}
                      </Text>
                      <Group gap="xs">
                        <Select
                          value={settings?.mobileScannerPageFormat || "A4"}
                          onChange={(value) => {
                            if (!loginEnabled) return;
                            setSettings({
                              ...settings,
                              mobileScannerPageFormat: value || "A4",
                            });
                          }}
                          data={[
                            {
                              value: "keep",
                              label: t(
                                "admin.settings.connections.pageFormatKeep",
                                "Keep (Original Dimensions)",
                              ),
                            },
                            {
                              value: "A4",
                              label: t(
                                "admin.settings.connections.pageFormatA4",
                                "A4 (210×297mm)",
                              ),
                            },
                            {
                              value: "letter",
                              label: t(
                                "admin.settings.connections.pageFormatLetter",
                                "Letter (8.5×11in)",
                              ),
                            },
                          ]}
                          disabled={!loginEnabled}
                          style={{ width: "250px" }}
                          comboboxProps={{ zIndex: Z_INDEX_CONFIG_MODAL }}
                        />
                        <PendingBadge
                          show={isFieldPending("mobileScannerPageFormat")}
                        />
                      </Group>
                    </div>

                    {/* Stretch to Fit */}
                    <div>
                      <Text size="sm" fw={500} mb="xs">
                        {t(
                          "admin.settings.connections.mobileScannerStretchToFit",
                          "Stretch to Fit",
                        )}
                      </Text>
                      <Text size="xs" c="dimmed" mb="sm">
                        {t(
                          "admin.settings.connections.mobileScannerStretchToFitDesc",
                          "Stretch images to fill the entire page. If disabled, images are centered with preserved aspect ratio.",
                        )}
                      </Text>
                      <Group gap="xs">
                        <Switch
                          checked={settings?.mobileScannerStretchToFit || false}
                          onChange={(e) => {
                            if (!loginEnabled) return;
                            setSettings({
                              ...settings,
                              mobileScannerStretchToFit: e.target.checked,
                            });
                          }}
                          disabled={!loginEnabled}
                        />
                        <PendingBadge
                          show={isFieldPending("mobileScannerStretchToFit")}
                        />
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
                {t(
                  "admin.settings.connections.linkedServices",
                  "Linked Services",
                )}
              </Text>
              <Stack gap="sm">
                {linkedProviders.map((provider) => (
                  <ProviderCard
                    key={provider.id}
                    provider={provider}
                    isConfigured={true}
                    settings={getProviderSettings(provider)}
                    onChange={(updatedSettings) =>
                      updateProviderSettings(provider, updatedSettings)
                    }
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
              {t(
                "admin.settings.connections.unlinkedServices",
                "Unlinked Services",
              )}
            </Text>
            <Stack gap="sm">
              {availableProviders.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  isConfigured={false}
                  settings={getProviderSettings(provider)}
                  onChange={(updatedSettings) =>
                    updateProviderSettings(provider, updatedSettings)
                  }
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

      <SettingsStickyFooter
        isDirty={isDirty}
        saving={adminSettings.saving}
        loginEnabled={loginEnabled}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    </div>
  );
}
