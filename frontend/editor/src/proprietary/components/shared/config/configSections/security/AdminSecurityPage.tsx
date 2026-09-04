import { useCallback, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
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
import type {
  ConnectionsSettingsData,
  SecuritySettingsData,
} from "@app/components/shared/config/configSections/security/securitySettingsTypes";
import {
  fetchConnectionsSettings,
  fetchSecuritySettings,
  saveConnectionsSettings,
  saveSecuritySettings,
} from "@app/components/shared/config/configSections/security/securitySettingsTransformers";
import { useConnectionProviders } from "@app/components/shared/config/configSections/security/connectionProviders";
import { AuthenticationCard } from "@app/components/shared/config/configSections/security/AuthenticationCard";
import { SessionsJwtCard } from "@app/components/shared/config/configSections/security/SessionsJwtCard";
import { LinkedServicesCard } from "@app/components/shared/config/configSections/security/LinkedServicesCard";
import { UnlinkedServicesCard } from "@app/components/shared/config/configSections/security/UnlinkedServicesCard";
import { SsoAutoLoginCard } from "@app/components/shared/config/configSections/security/SsoAutoLoginCard";
import { HtmlUrlSecurityCard } from "@app/components/shared/config/configSections/security/HtmlUrlSecurityCard";
import { AuditLoggingCard } from "@app/components/shared/config/configSections/security/AuditLoggingCard";
import "@app/components/shared/config/configSections/security/AdminSecurityPage.css";

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
  // whichever renders first and ?focus=adminConnections still lands.
  const hasLinked = linkedProviders.length > 0;

  return (
    <div className="settings-section-container">
      <Stack gap="lg" className="settings-section-content">
        <LoginRequiredBanner show={!loginEnabled} />

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
