import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Stack, Paper, Text, TextInput, Loader, Group } from "@mantine/core";
import { alert } from "@app/components/toast";
import RestartConfirmationModal from "@app/components/shared/config/RestartConfirmationModal";
import { useRestartServer } from "@app/components/shared/config/useRestartServer";
import { useAdminSettings } from "@app/hooks/useAdminSettings";
import { useSettingsDirty } from "@app/hooks/useSettingsDirty";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import { SettingsStickyFooter } from "@app/components/shared/config/SettingsStickyFooter";
import EditableSecretField from "@app/components/shared/EditableSecretField";
import { useLoginRequired } from "@app/hooks/useLoginRequired";

interface GmailMailboxSettings {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  allowedEmails?: string[];
}

interface MailboxSettingsData {
  gmail?: GmailMailboxSettings;
}

export default function AdminMailboxSection() {
  const { t } = useTranslation();
  const { loginEnabled } = useLoginRequired();
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
  } = useAdminSettings<MailboxSettingsData>({
    sectionName: "mailbox",
    saveTransformer: (current) => ({
      sectionData: {},
      deltaSettings: {
        "mailbox.gmail.clientId": current.gmail?.clientId ?? "",
        "mailbox.gmail.clientSecret": current.gmail?.clientSecret ?? "",
        "mailbox.gmail.redirectUri": current.gmail?.redirectUri ?? "",
        "mailbox.gmail.allowedEmails": current.gmail?.allowedEmails ?? [],
      },
    }),
  });

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const { isDirty, resetToSnapshot, markSaved } = useSettingsDirty(
    settings,
    loading,
  );

  const handleSave = async () => {
    try {
      await saveSettings();
      markSaved();
      showRestartModal();
    } catch (_error) {
      alert({
        alertType: "error",
        title: t("admin.error", "Error"),
        body: t("admin.settings.saveError", "Failed to save settings"),
      });
    }
  };

  const handleDiscard = useCallback(() => {
    setSettings(resetToSnapshot());
  }, [resetToSnapshot, setSettings]);

  const gmail = settings.gmail ?? {};
  const updateGmail = (patch: Partial<GmailMailboxSettings>) =>
    setSettings({ ...settings, gmail: { ...gmail, ...patch } });

  if (loading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
      </Stack>
    );
  }

  return (
    <div className="settings-section-container">
      <Stack gap="lg" className="settings-section-content">
        <div>
          <Text fw={600} size="lg">
            {t("admin.settings.mailbox.title", "Mailbox")}
          </Text>
          <Text size="sm" c="dimmed">
            {t(
              "admin.settings.mailbox.description",
              "Configure the OAuth connection used to read mailbox attachments.",
            )}
          </Text>
        </div>

        <Paper withBorder p="md" radius="md">
          <Stack gap="md">
            <Text fw={500} size="sm">
              Gmail OAuth
            </Text>
            <Text size="xs" c="dimmed">
              {t(
                "admin.settings.mailbox.gmail.note",
                "These values are read from settings.yml under mailbox.gmail. Changes require a server restart.",
              )}
            </Text>

            <TextInput
              label={
                <Group gap="xs">
                  <span>Client ID</span>
                  <PendingBadge show={isFieldPending("gmail.clientId")} />
                </Group>
              }
              value={gmail.clientId || ""}
              onChange={(event) =>
                updateGmail({ clientId: event.currentTarget.value })
              }
              disabled={!loginEnabled}
            />

            <div>
              <Group gap="xs" align="center" mb={4}>
                <span style={{ fontWeight: 500, fontSize: "0.875rem" }}>
                  Client Secret
                </span>
                <PendingBadge show={isFieldPending("gmail.clientSecret")} />
              </Group>
              <EditableSecretField
                value={gmail.clientSecret || ""}
                onChange={(value) => updateGmail({ clientSecret: value })}
                placeholder="Google OAuth client secret"
                disabled={!loginEnabled}
              />
            </div>

            <TextInput
              label={
                <Group gap="xs">
                  <span>Redirect URI</span>
                  <PendingBadge show={isFieldPending("gmail.redirectUri")} />
                </Group>
              }
              description="Optional fixed public callback URI"
              placeholder="https://example.com/api/v1/email/gmail/callback"
              value={gmail.redirectUri || ""}
              onChange={(event) =>
                updateGmail({ redirectUri: event.currentTarget.value })
              }
              disabled={!loginEnabled}
            />

            <TextInput
              label={
                <Group gap="xs">
                  <span>Allowed Google account emails</span>
                  <PendingBadge show={isFieldPending("gmail.allowedEmails")} />
                </Group>
              }
              description="Leave empty to allow all Google accounts. Separate addresses with commas."
              placeholder="user@example.com, admin@example.com"
              value={(gmail.allowedEmails ?? []).join(", ")}
              onChange={(event) =>
                updateGmail({
                  allowedEmails: event.currentTarget.value
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean),
                })
              }
              disabled={!loginEnabled}
            />
          </Stack>
        </Paper>
      </Stack>

      <SettingsStickyFooter
        isDirty={isDirty}
        saving={saving}
        loginEnabled={loginEnabled}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />

      <RestartConfirmationModal
        opened={restartModalOpened}
        onClose={closeRestartModal}
        onRestart={restartServer}
      />
    </div>
  );
}
