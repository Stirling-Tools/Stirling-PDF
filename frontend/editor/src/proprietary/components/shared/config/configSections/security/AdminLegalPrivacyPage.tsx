import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
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
  LegalSettingsData,
  PrivacySettingsData,
} from "@app/components/shared/config/configSections/security/securitySettingsTypes";
import {
  fetchPrivacySettings,
  saveLegalSettings,
  savePrivacySettings,
} from "@app/components/shared/config/configSections/security/securitySettingsTransformers";
import { LegalDocumentsCard } from "@app/components/shared/config/configSections/security/LegalDocumentsCard";
import { LoginAgreementCard } from "@app/components/shared/config/configSections/security/LoginAgreementCard";
import { AnalyticsTrackingCard } from "@app/components/shared/config/configSections/security/AnalyticsTrackingCard";
import { SearchEngineVisibilityCard } from "@app/components/shared/config/configSections/security/SearchEngineVisibilityCard";
import "@app/components/shared/config/configSections/security/AdminSecurityPage.css";

/**
 * What this deployment tells the world about itself: the documents people are
 * shown, whether it reports usage, and whether search engines may index it.
 * None of it governs who may sign in, which is why it is not on that page.
 */
export default function AdminLegalPrivacyPage() {
  const { t } = useTranslation();
  const { loginEnabled, validateLoginEnabled, getDisabledStyles } =
    useLoginRequired();
  const {
    restartModalOpened,
    showRestartModal,
    closeRestartModal,
    restartServer,
  } = useRestartServer();

  const privacy = useAdminSettings<PrivacySettingsData>({
    sectionName: "privacy",
    enabled: loginEnabled,
    fetchTransformer: fetchPrivacySettings,
    saveTransformer: savePrivacySettings,
  });
  const legal = useAdminSettings<LegalSettingsData>({
    sectionName: "legal",
    enabled: loginEnabled,
    saveTransformer: saveLegalSettings,
  });

  // A disabled sub-fetch reports loading forever, so the ternary decides it.
  const loading = loginEnabled ? privacy.loading || legal.loading : false;

  const draft = useMemo(
    () => ({ privacy: privacy.settings, legal: legal.settings }),
    [privacy.settings, legal.settings],
  );
  const { isDirty, resetToSnapshot, markSaved } = useSettingsDirty(
    draft,
    loading,
  );

  const handleSave = async () => {
    if (!validateLoginEnabled()) return;
    const results: PromiseSettledResult<void>[] = [];
    for (const save of [privacy.saveSettings, legal.saveSettings]) {
      // Sequential, not Promise.all: both PUT the same flat settings endpoint.
      const [result] = await Promise.allSettled([save()]);
      results.push(result);
    }
    if (results.some((r) => r.status === "rejected")) {
      // No markSaved on a partial failure, or the footer clears while a draft
      // that never reached the server is still on screen.
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
    privacy.setSettings(original.privacy);
    legal.setSettings(original.legal);
  }, [resetToSnapshot, privacy.setSettings, legal.setSettings]);

  if (loading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
      </Stack>
    );
  }

  const privacyCard = {
    settings: privacy.settings,
    setSettings: privacy.setSettings,
    isFieldPending: privacy.isFieldPending,
    loginEnabled,
    getDisabledStyles,
  };
  const legalCard = {
    settings: legal.settings,
    setSettings: legal.setSettings,
    isFieldPending: legal.isFieldPending,
    loginEnabled,
    getDisabledStyles,
  };

  return (
    <div className="settings-section-container">
      <Stack gap="lg" className="settings-section-content">
        <LoginRequiredBanner show={!loginEnabled} />

        <section className="admin-security__card">
          <h2 className="admin-security__heading" id="adminLegal">
            {t("settings.policiesPrivacy.legal", "Legal documents")}
          </h2>
          <p className="admin-security__description">
            {t(
              "admin.settings.legal.description",
              "Configure links to legal documents and policies.",
            )}
          </p>
          <LegalDocumentsCard {...legalCard} />
        </section>

        <section className="admin-security__card">
          <h2 className="admin-security__heading" id="legalLoginAgreement">
            {t("admin.settings.legal.loginAgreement.title", "Login agreement")}
          </h2>
          <LoginAgreementCard {...legalCard} />
        </section>

        <section className="admin-security__card">
          <h2 className="admin-security__heading" id="adminPrivacy">
            {t("admin.settings.privacy.analytics", "Analytics & Tracking")}
          </h2>
          <p className="admin-security__description">
            {t(
              "admin.settings.privacy.description",
              "What this server discloses about itself, and what it reports.",
            )}
          </p>
          <AnalyticsTrackingCard {...privacyCard} />
        </section>

        <section className="admin-security__card">
          <h2 className="admin-security__heading" id="privacySearchEngine">
            {t(
              "admin.settings.privacy.searchEngine",
              "Search engine visibility",
            )}
          </h2>
          <SearchEngineVisibilityCard {...privacyCard} />
        </section>
      </Stack>

      <SettingsStickyFooter
        isDirty={isDirty}
        saving={privacy.saving || legal.saving}
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
