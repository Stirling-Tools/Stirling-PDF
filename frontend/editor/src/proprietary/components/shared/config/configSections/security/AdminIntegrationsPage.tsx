import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { SettingsCard } from "@app/components/shared/config/SettingsCard";
import { Stack, Loader } from "@mantine/core";
import { alert } from "@app/components/toast";
import RestartConfirmationModal from "@app/components/shared/config/RestartConfirmationModal";
import { useRestartServer } from "@app/components/shared/config/useRestartServer";
import { useAdminSettings } from "@app/hooks/useAdminSettings";
import { useSettingsDirty } from "@app/hooks/useSettingsDirty";
import { SettingsStickyFooter } from "@app/components/shared/config/SettingsStickyFooter";
import { useLoginRequired } from "@app/hooks/useLoginRequired";
import LoginRequiredBanner from "@app/components/shared/config/LoginRequiredBanner";
import type { ConnectionsSettingsData } from "@app/components/shared/config/configSections/security/securitySettingsTypes";
import {
  fetchConnectionsSettings,
  saveConnectionsSettings,
} from "@app/components/shared/config/configSections/security/securitySettingsTransformers";
import { useConnectionProviders } from "@app/components/shared/config/configSections/security/connectionProviders";
import { LinkedServicesCard } from "@app/components/shared/config/configSections/security/LinkedServicesCard";
import { UnlinkedServicesCard } from "@app/components/shared/config/configSections/security/UnlinkedServicesCard";
import { MobileUploadQrCard } from "@app/components/shared/config/configSections/security/MobileUploadQrCard";
import "@app/components/shared/config/configSections/security/AdminSecurityPage.css";

/**
 * The services this server talks to: mail, Telegram, Drive, and the phone that
 * uploads by QR. Sign-in providers live on the security page instead - these
 * are wiring, not authentication, and lumping them together made "Single
 * sign-on" the page you had to visit to configure SMTP.
 *
 * Shares the `connections` section with the security page, which is safe
 * because only one settings section is mounted at a time.
 */
export default function AdminIntegrationsPage() {
  const { t } = useTranslation();
  const { loginEnabled, validateLoginEnabled, getDisabledStyles } =
    useLoginRequired();
  const {
    restartModalOpened,
    showRestartModal,
    closeRestartModal,
    restartServer,
  } = useRestartServer();

  const connections = useAdminSettings<ConnectionsSettingsData>({
    sectionName: "connections",
    enabled: loginEnabled,
    fetchTransformer: fetchConnectionsSettings,
    saveTransformer: saveConnectionsSettings,
  });

  // A disabled fetch reports loading forever, so the ternary decides it.
  const loading = loginEnabled ? connections.loading : false;
  const { isDirty, resetToSnapshot, markSaved } = useSettingsDirty(
    connections.settings,
    loading,
  );

  const { linkedProviders, availableProviders } = useConnectionProviders(
    connections.settings,
    "integration",
  );

  const handleSave = async () => {
    if (!validateLoginEnabled()) return;
    try {
      await connections.saveSettings();
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
    connections.setSettings(resetToSnapshot());
  }, [resetToSnapshot, connections.setSettings]);

  if (loading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
      </Stack>
    );
  }

  const card = {
    settings: connections.settings,
    setSettings: connections.setSettings,
    isFieldPending: connections.isFieldPending,
    loginEnabled,
    getDisabledStyles,
  };

  return (
    <div className="settings-section-container">
      <Stack gap="lg" className="settings-section-content">
        <LoginRequiredBanner show={!loginEnabled} />

        <SettingsCard
          id="adminConnections"
          title={t(
            "admin.settings.connections.linkedServices",
            "Connected services",
          )}
          description={t(
            "admin.settings.connections.description",
            "Single sign-on providers and the other services this server talks to.",
          )}
        >
          <LinkedServicesCard {...card} providers={linkedProviders} />
        </SettingsCard>

        <SettingsCard
          id="integrationsAvailable"
          title={t(
            "admin.settings.connections.unlinkedServices",
            "Available services",
          )}
        >
          <UnlinkedServicesCard {...card} providers={availableProviders} />
        </SettingsCard>

        <SettingsCard
          id="connectionsMobileScanner"
          title={t(
            "admin.settings.connections.mobileScanner.label",
            "Mobile upload",
          )}
        >
          <MobileUploadQrCard {...card} />
        </SettingsCard>
      </Stack>

      <SettingsStickyFooter
        isDirty={isDirty}
        saving={connections.saving}
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
