import { useCallback, useEffect, useMemo } from "react";
import { TierBadge } from "@editor/components/shared/config/TierBadge";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SettingsCard } from "@editor/components/shared/config/SettingsCard";
import { SettingsToggleRow } from "@editor/components/shared/config/SettingsToggleRow";
import { Stack, Loader } from "@mantine/core";
import { alert } from "@editor/components/toast";
import RestartConfirmationModal from "@editor/components/shared/config/RestartConfirmationModal";
import { useRestartServer } from "@editor/components/shared/config/useRestartServer";
import { useAdminSettings } from "@editor/hooks/useAdminSettings";
import { useSettingsDirty } from "@editor/hooks/useSettingsDirty";
import { SettingsStickyFooter } from "@editor/components/shared/config/SettingsStickyFooter";
import { useLoginRequired } from "@editor/hooks/useLoginRequired";
import type {
  ConnectionsSettingsData,
  SecuritySettingsData,
} from "@editor/components/shared/config/configSections/security/securitySettingsTypes";
import {
  fetchConnectionsSettings,
  fetchSecuritySettings,
  saveConnectionsSettings,
  saveSecuritySettings,
} from "@editor/components/shared/config/configSections/security/securitySettingsTransformers";
import { useConnectionProviders } from "@editor/components/shared/config/configSections/security/connectionProviders";
import { AuthenticationCard } from "@editor/components/shared/config/configSections/security/AuthenticationCard";
import { SessionsJwtCard } from "@editor/components/shared/config/configSections/security/SessionsJwtCard";
import { LinkedServicesCard } from "@editor/components/shared/config/configSections/security/LinkedServicesCard";
import { UnlinkedServicesCard } from "@editor/components/shared/config/configSections/security/UnlinkedServicesCard";
import { SsoAutoLoginCard } from "@editor/components/shared/config/configSections/security/SsoAutoLoginCard";
import { HtmlUrlSecurityCard } from "@editor/components/shared/config/configSections/security/HtmlUrlSecurityCard";
import { AuditLoggingCard } from "@editor/components/shared/config/configSections/security/AuditLoggingCard";
import "@editor/components/shared/config/configSections/security/AdminSecurityPage.css";

/**
 * Sign-in and security, previously four nav rows. Unlike the AI fold these are
 * four genuinely different backend sections, so the page keeps four fetches but
 * only one dirty flag, one footer and one save, and each card is handed the
 * slice of the draft its own section owns.
 */
export default function AdminSecurityPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const { loginEnabled, validateLoginEnabled, getDisabledStyles } =
    useLoginRequired();
  const {
    restartModalOpened,
    showRestartModal,
    closeRestartModal,
    restartServer,
  } = useRestartServer();

  const security = useAdminSettings<SecuritySettingsData>({
    sectionName: "security",
    enabled: loginEnabled,
    fetchTransformer: fetchSecuritySettings,
    saveTransformer: saveSecuritySettings,
  });

  const connections = useAdminSettings<ConnectionsSettingsData>({
    sectionName: "connections",
    enabled: loginEnabled,
    fetchTransformer: fetchConnectionsSettings,
    saveTransformer: saveConnectionsSettings,
  });

  // A disabled sub-fetch reports loading forever, so the ternary decides it -
  // a blanket OR would freeze the page on a loader when login is off.
  const loading = loginEnabled
    ? security.loading || connections.loading
    : false;

  const draft = useMemo(
    () => ({
      security: security.settings,
      connections: connections.settings,
    }),
    [security.settings, connections.settings],
  );

  const { isDirty, resetToSnapshot, markSaved } = useSettingsDirty(
    draft,
    loading,
  );

  // Sign-in providers only; Telegram, Drive and SMTP live on Integrations.
  const { linkedProviders, availableProviders } = useConnectionProviders(
    connections.settings,
    "signin",
  );

  // Deep links land on a card id, so the jump waits for the cards to exist.
  useEffect(() => {
    if (location.hash && !loading) {
      const elementId = location.hash.substring(1); // Remove the #
      const element = document.getElementById(elementId);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      }
    }
  }, [location.hash, loading]);

  const handleSave = async () => {
    if (!validateLoginEnabled()) {
      return;
    }

    const results: PromiseSettledResult<void>[] = [];
    for (const save of [security.saveSettings, connections.saveSettings]) {
      // Sequential, not Promise.all: several of these PUT the same flat
      // settings endpoint and would overwrite each other's merge.
      const [result] = await Promise.allSettled([save()]);
      results.push(result);
    }

    if (results.some((result) => result.status === "rejected")) {
      // No markSaved on a partial failure: re-snapshotting would clear the
      // footer while drafts that never reached the server are still on screen.
      alert({
        alertType: "error",
        title: t("admin.error", "Error"),
        body: t("admin.settings.saveError", "Failed to save settings"),
      });
      return;
    }

    markSaved();
    showRestartModal();
  };

  const handleDiscard = useCallback(() => {
    const original = resetToSnapshot();
    security.setSettings(original.security);
    connections.setSettings(original.connections);
  }, [resetToSnapshot, security.setSettings, connections.setSettings]);

  if (loading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
      </Stack>
    );
  }

  const securityCard = {
    settings: security.settings,
    setSettings: security.setSettings,
    isFieldPending: security.isFieldPending,
    loginEnabled,
    getDisabledStyles,
  };
  const connectionsCard = {
    settings: connections.settings,
    setSettings: connections.setSettings,
    isFieldPending: connections.isFieldPending,
    loginEnabled,
    getDisabledStyles,
  };

  // Both services sections are conditional, so the retired nav key rides
  // whichever renders first and #adminConnections still lands.
  const hasLinked = linkedProviders.length > 0;

  return (
    <div className="settings-section-container">
      <Stack gap="lg" className="settings-section-content">
        <SettingsCard
          id="pdfPermissions"
          title={t("admin.settings.security.pdfPermissions", "PDF permissions")}
        >
          <SettingsToggleRow
            label={t(
              "admin.settings.security.honorOwnerPasswords.label",
              "Honor PDF permissions",
            )}
            info={t(
              "admin.settings.security.honorOwnerPasswords.description",
              "Require the permissions password for restricted actions. Turning this off still requires passwords needed to open PDFs.",
            )}
            pending={security.isFieldPending("honorOwnerPasswords")}
            checked={security.settings?.honorOwnerPasswords ?? true}
            disabled={!loginEnabled}
            onChange={(checked) =>
              security.setSettings({
                ...security.settings,
                honorOwnerPasswords: checked,
              })
            }
          />
        </SettingsCard>
        <SettingsCard
          id="securityAuthentication"
          title={t("admin.settings.security.authentication", "Authentication")}
        >
          <AuthenticationCard {...securityCard} />
        </SettingsCard>

        <SettingsCard
          id="securityJwt"
          title={t("admin.settings.security.jwt.label", "JWT Configuration")}
        >
          <SessionsJwtCard {...securityCard} />
        </SettingsCard>

        {hasLinked && (
          <SettingsCard
            id="adminConnections"
            title={t(
              "admin.settings.connections.linkedServices",
              "Linked Services",
            )}
          >
            <LinkedServicesCard
              {...connectionsCard}
              providers={linkedProviders}
            />
          </SettingsCard>
        )}

        {availableProviders.length > 0 && (
          <section className="admin-security__card">
            <h2
              className="admin-security__heading"
              id={hasLinked ? "connectionsUnlinked" : "adminConnections"}
            >
              {t(
                "admin.settings.connections.unlinkedServices",
                "Unlinked Services",
              )}
            </h2>
            <UnlinkedServicesCard
              {...connectionsCard}
              providers={availableProviders}
            />
          </section>
        )}

        <SettingsCard
          id="connectionsSsoAutoLogin"
          title={t(
            "admin.settings.connections.ssoAutoLogin.label",
            "SSO Auto Login",
          )}
        >
          <SsoAutoLoginCard {...connectionsCard} />
        </SettingsCard>

        <SettingsCard
          id="securityHtmlUrl"
          title={t(
            "admin.settings.security.htmlUrlSecurity.label",
            "HTML URL Security",
          )}
          description={t(
            "admin.settings.security.htmlUrlSecurity.description",
            "Configure URL access restrictions for HTML processing to prevent SSRF attacks",
          )}
        >
          <HtmlUrlSecurityCard {...securityCard} />
        </SettingsCard>

        <SettingsCard
          id="auditLogging"
          title={t("admin.settings.security.audit.label", "Audit Logging")}
          badge={<TierBadge tier="ENTERPRISE" />}
        >
          <AuditLoggingCard {...securityCard} />
        </SettingsCard>
      </Stack>

      <SettingsStickyFooter
        isDirty={isDirty}
        saving={security.saving || connections.saving}
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
