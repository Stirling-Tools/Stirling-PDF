import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SettingsCard } from "@app/components/shared/config/SettingsCard";
import { Stack, Loader } from "@mantine/core";
import { alert } from "@app/components/toast";
import RestartConfirmationModal from "@app/components/shared/config/RestartConfirmationModal";
import { useRestartServer } from "@app/components/shared/config/useRestartServer";
import { useAdminSettings } from "@app/hooks/useAdminSettings";
import apiClient from "@app/services/apiClient";
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
import { McpCard } from "@app/components/shared/config/configSections/server/McpCard";
import type { McpSettingsData } from "@app/components/shared/config/configSections/server/serverSettings";
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

  const {
    settings: mcp,
    setSettings: setMcp,
    loading: mcpLoading,
    saving: mcpSaving,
    saveSettings: saveMcp,
    isFieldPending: isMcpFieldPending,
  } = useAdminSettings<McpSettingsData>({
    sectionName: "mcp",
    // The standalone MCP row passed no `enabled` and fetched with login off. It
    // has to gate like its neighbours now, or its late arrival reads as an edit.
    enabled: loginEnabled,
    fetchTransformer: async (): Promise<
      McpSettingsData & { _pending?: Partial<McpSettingsData> }
    > => {
      const response = await apiClient.get<
        McpSettingsData & { _pending?: Partial<McpSettingsData> }
      >("/api/v1/admin/settings/section/mcp");
      return response.data || {};
    },
    // Save nested auth.* keys as dot-notation through the root endpoint so siblings are preserved.
    saveTransformer: (s: McpSettingsData) => ({
      sectionData: {},
      deltaSettings: {
        "mcp.enabled": s.enabled ?? false,
        "mcp.scopesEnabled": s.scopesEnabled ?? true,
        "mcp.allowedOperations": s.allowedOperations ?? [],
        "mcp.blockedOperations": s.blockedOperations ?? [],
        "mcp.auth.mode": s.auth?.mode ?? "oauth",
        "mcp.auth.issuerUri": s.auth?.issuerUri ?? "",
        "mcp.auth.jwksUri": s.auth?.jwksUri ?? "",
        "mcp.auth.resourceId": s.auth?.resourceId ?? "",
        "mcp.auth.acceptedAudiences": s.auth?.acceptedAudiences ?? [],
        "mcp.auth.usernameClaim": s.auth?.usernameClaim ?? "sub",
        "mcp.auth.requireExistingAccount":
          s.auth?.requireExistingAccount ?? true,
      },
    }),
  });

  // A disabled fetch reports loading forever, so the ternary decides it.
  const loading = loginEnabled ? connections.loading || mcpLoading : false;
  const draft = useMemo(
    () => ({ connections: connections.settings, mcp }),
    [connections.settings, mcp],
  );
  const { isDirty, resetToSnapshot, markSaved } = useSettingsDirty(
    draft,
    loading,
  );

  const { linkedProviders, availableProviders } = useConnectionProviders(
    connections.settings,
    "integration",
  );

  const handleSave = async () => {
    if (!validateLoginEnabled()) return;
    try {
      // Sequential, not Promise.all: both PUT the same flat settings endpoint.
      await connections.saveSettings();
      await saveMcp();
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
    const original = resetToSnapshot();
    connections.setSettings(original.connections);
    setMcp(original.mcp);
  }, [resetToSnapshot, connections.setSettings, setMcp]);

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

        <SettingsCard
          id="adminMcp"
          title={t("settings.configuration.mcp", "MCP Server")}
          description={t(
            "admin.settings.mcp.description",
            "Expose this server's tools to MCP clients, and choose which ones.",
          )}
        >
          <McpCard
            settings={mcp}
            setSettings={setMcp}
            isFieldPending={isMcpFieldPending}
            loginEnabled={loginEnabled}
          />
        </SettingsCard>
      </Stack>

      <SettingsStickyFooter
        isDirty={isDirty}
        saving={connections.saving || mcpSaving}
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
