import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Anchor,
  Badge,
  Group,
  Loader,
  Paper,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { alert } from "@app/components/toast";
import RestartConfirmationModal from "@app/components/shared/config/RestartConfirmationModal";
import { useRestartServer } from "@app/components/shared/config/useRestartServer";
import { useAdminSettings } from "@app/hooks/useAdminSettings";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import apiClient from "@app/services/apiClient";
import { useLoginRequired } from "@app/hooks/useLoginRequired";
import LoginRequiredBanner from "@app/components/shared/config/LoginRequiredBanner";
import { SettingsStickyFooter } from "@app/components/shared/config/SettingsStickyFooter";
import { useSettingsDirty } from "@app/hooks/useSettingsDirty";

interface StorageSharingSettingsData {
  enabled?: boolean;
  sharing?: {
    enabled?: boolean;
    linkEnabled?: boolean;
    emailEnabled?: boolean;
  };
  signing?: {
    enabled?: boolean;
  };
  system?: {
    frontendUrl?: string;
  };
  mail?: {
    enabled?: boolean;
  };
}

export default function AdminStorageSharingSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { loginEnabled, validateLoginEnabled, getDisabledStyles } =
    useLoginRequired();
  const {
    restartModalOpened,
    showRestartModal,
    closeRestartModal,
    restartServer,
  } = useRestartServer();

  const {
    settings,
    setSettings,
    loading,
    saving,
    fetchSettings,
    saveSettings,
    isFieldPending,
  } = useAdminSettings<StorageSharingSettingsData>({
    sectionName: "storage",
    fetchTransformer: async () => {
      const [storageResponse, systemResponse, mailResponse] = await Promise.all(
        [
          apiClient.get("/api/v1/admin/settings/section/storage"),
          apiClient.get("/api/v1/admin/settings/section/system"),
          apiClient.get("/api/v1/admin/settings/section/mail"),
        ],
      );

      const storageData = storageResponse.data || {};
      const systemData = systemResponse.data || {};
      const mailData = mailResponse.data || {};

      return {
        ...storageData,
        system: { frontendUrl: systemData.frontendUrl || "" },
        mail: { enabled: mailData.enabled || false },
      };
    },
    saveTransformer: (currentSettings) => ({
      sectionData: {
        enabled: currentSettings.enabled,
        sharing: {
          enabled: currentSettings.sharing?.enabled,
          linkEnabled: currentSettings.sharing?.linkEnabled,
          emailEnabled: currentSettings.sharing?.emailEnabled,
        },
        signing: {
          enabled: currentSettings.signing?.enabled,
        },
      },
    }),
  });

  useEffect(() => {
    if (loginEnabled) {
      fetchSettings();
    }
  }, [loginEnabled]);

  const storageEnabled = settings.enabled ?? false;
  const sharingEnabled = storageEnabled && (settings.sharing?.enabled ?? false);
  const frontendUrlConfigured = Boolean(settings.system?.frontendUrl?.trim());
  const mailEnabled = Boolean(settings.mail?.enabled);

  const { isDirty, resetToSnapshot, markSaved } = useSettingsDirty(
    settings,
    loading,
  );

  const handleDiscard = useCallback(() => {
    setSettings(resetToSnapshot());
  }, [resetToSnapshot, setSettings]);

  const handleSave = async () => {
    if (!validateLoginEnabled()) {
      return;
    }
    try {
      markSaved();
      await saveSettings();
      showRestartModal();
    } catch (_error) {
      alert({
        alertType: "error",
        title: t("admin.error", "Error"),
        body: t("admin.settings.saveError", "Failed to save settings"),
      });
    }
  };

  if (loginEnabled && loading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
      </Stack>
    );
  }

  return (
    <div className="settings-section-container">
      <div className="settings-section-content">
        <Stack gap="sm">
          <LoginRequiredBanner show={!loginEnabled} />
          <div>
            <Group gap="xs" align="center">
              <Text fw={600} size="lg">
                {t("admin.settings.storage.title", "File Storage & Sharing")}
              </Text>
              <Badge size="sm" variant="light" color="orange">
                {t("toolPanel.alpha", "Alpha")}
              </Badge>
            </Group>
            <Text size="sm" c="dimmed">
              {t(
                "admin.settings.storage.description",
                "Control server storage and sharing options.",
              )}
            </Text>
          </div>

          <Paper withBorder p="sm" radius="md">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <div>
                <Group gap="xs" align="center">
                  <Text fw={600} size="sm">
                    {t(
                      "admin.settings.storage.enabled.label",
                      "Enable Server File Storage",
                    )}
                  </Text>
                  {isFieldPending("enabled") && <PendingBadge show={true} />}
                </Group>
                <Text size="xs" c="dimmed">
                  {t(
                    "admin.settings.storage.enabled.description",
                    "Allow users to store files on the server.",
                  )}
                </Text>
              </div>
              <Switch
                checked={storageEnabled}
                onChange={(e) =>
                  setSettings({ ...settings, enabled: e.currentTarget.checked })
                }
                disabled={!loginEnabled}
                styles={getDisabledStyles()}
                style={{ flexShrink: 0 }}
              />
            </Group>
          </Paper>

          <Paper withBorder p="sm" radius="md">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <div>
                <Group gap="xs" align="center">
                  <Text fw={600} size="sm">
                    {t(
                      "admin.settings.storage.sharing.enabled.label",
                      "Enable Sharing",
                    )}
                  </Text>
                  {isFieldPending("sharing.enabled") && (
                    <PendingBadge show={true} />
                  )}
                </Group>
                <Text size="xs" c="dimmed">
                  {t(
                    "admin.settings.storage.sharing.enabled.description",
                    "Allow users to share stored files.",
                  )}
                </Text>
              </div>
              <Switch
                checked={settings.sharing?.enabled ?? false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    sharing: {
                      ...settings.sharing,
                      enabled: e.currentTarget.checked,
                    },
                  })
                }
                disabled={!loginEnabled || !storageEnabled}
                styles={getDisabledStyles()}
                style={{ flexShrink: 0 }}
              />
            </Group>
          </Paper>

          <Paper withBorder p="sm" radius="md">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <div>
                <Group gap="xs" align="center">
                  <Text fw={600} size="sm">
                    {t(
                      "admin.settings.storage.sharing.links.label",
                      "Enable Share Links",
                    )}
                  </Text>
                  {isFieldPending("sharing.linkEnabled") && (
                    <PendingBadge show={true} />
                  )}
                </Group>
                <Text size="xs" c="dimmed">
                  {t(
                    "admin.settings.storage.sharing.links.description",
                    "Allow sharing via signed-in links.",
                  )}
                </Text>
                {!frontendUrlConfigured && (
                  <Text size="xs" c="orange">
                    {t(
                      "admin.settings.storage.sharing.links.frontendUrlNote",
                      "Requires a Frontend URL. ",
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
                        "admin.settings.storage.sharing.links.frontendUrlLink",
                        "Configure in System Settings",
                      )}
                    </Anchor>
                  </Text>
                )}
              </div>
              <Switch
                checked={settings.sharing?.linkEnabled ?? false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    sharing: {
                      ...settings.sharing,
                      linkEnabled: e.currentTarget.checked,
                    },
                  })
                }
                disabled={
                  !loginEnabled || !sharingEnabled || !frontendUrlConfigured
                }
                styles={getDisabledStyles()}
                style={{ flexShrink: 0 }}
              />
            </Group>
          </Paper>

          <Paper withBorder p="sm" radius="md">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <div>
                <Group gap="xs" align="center">
                  <Text fw={600} size="sm">
                    {t(
                      "admin.settings.storage.sharing.email.label",
                      "Enable Email Sharing",
                    )}
                  </Text>
                  {isFieldPending("sharing.emailEnabled") && (
                    <PendingBadge show={true} />
                  )}
                </Group>
                <Text size="xs" c="dimmed">
                  {t(
                    "admin.settings.storage.sharing.email.description",
                    "Allow sharing with email addresses.",
                  )}
                </Text>
                {!mailEnabled && (
                  <Text size="xs" c="orange">
                    {t(
                      "admin.settings.storage.sharing.email.mailNote",
                      "Requires mail configuration. ",
                    )}
                    <Anchor
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        navigate("/settings/adminConnections");
                      }}
                      c="orange"
                      td="underline"
                    >
                      {t(
                        "admin.settings.storage.sharing.email.mailLink",
                        "Configure Mail Settings",
                      )}
                    </Anchor>
                  </Text>
                )}
              </div>
              <Switch
                checked={settings.sharing?.emailEnabled ?? false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    sharing: {
                      ...settings.sharing,
                      emailEnabled: e.currentTarget.checked,
                    },
                  })
                }
                disabled={!loginEnabled || !sharingEnabled || !mailEnabled}
                styles={getDisabledStyles()}
                style={{ flexShrink: 0 }}
              />
            </Group>
          </Paper>

          <Paper withBorder p="sm" radius="md">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <div>
                <Group gap="xs" align="center">
                  <Text fw={600} size="sm">
                    {t(
                      "admin.settings.storage.signing.enabled.label",
                      "Enable Group Signing",
                    )}
                  </Text>
                  {isFieldPending("signing.enabled") && (
                    <PendingBadge show={true} />
                  )}
                </Group>
                <Text size="xs" c="dimmed">
                  {t(
                    "admin.settings.storage.signing.enabled.description",
                    "Allow users to create multi-participant document signing sessions. Requires server file storage to be enabled.",
                  )}
                </Text>
              </div>
              <Switch
                checked={settings.signing?.enabled ?? false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    signing: {
                      ...settings.signing,
                      enabled: e.currentTarget.checked,
                    },
                  })
                }
                disabled={!loginEnabled || !storageEnabled}
                styles={getDisabledStyles()}
                style={{ flexShrink: 0 }}
              />
            </Group>
          </Paper>

          <RestartConfirmationModal
            opened={restartModalOpened}
            onClose={closeRestartModal}
            onRestart={restartServer}
          />
        </Stack>
      </div>
      <SettingsStickyFooter
        isDirty={isDirty}
        saving={saving}
        loginEnabled={loginEnabled}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    </div>
  );
}
