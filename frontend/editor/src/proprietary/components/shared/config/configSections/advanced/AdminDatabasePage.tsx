import { useCallback, useMemo } from "react";
import { TierBadge } from "@app/components/shared/config/TierBadge";
import { useTranslation } from "react-i18next";
import { SettingsCard } from "@app/components/shared/config/SettingsCard";
import { Stack, Loader } from "@mantine/core";
import { alert } from "@app/components/toast";
import RestartConfirmationModal from "@app/components/shared/config/RestartConfirmationModal";
import { useRestartServer } from "@app/components/shared/config/useRestartServer";
import { useAdminSettings } from "@app/hooks/useAdminSettings";
import { useSettingsDirty } from "@app/hooks/useSettingsDirty";
import { SettingsStickyFooter } from "@app/components/shared/config/SettingsStickyFooter";
import apiClient from "@app/services/apiClient";
import { useLoginRequired } from "@app/hooks/useLoginRequired";
import {
  DEFAULT_DATASOURCE,
  isEmbeddedH2Database,
  type DatasourceSettingsData,
} from "@app/components/shared/config/configSections/advanced/advancedSettings";
import { DatabaseConfigCard } from "@app/components/shared/config/configSections/advanced/DatabaseConfigCard";
import { DatabaseBackupsCard } from "@app/components/shared/config/configSections/advanced/DatabaseBackupsCard";
import "@app/components/shared/config/configSections/advanced/AdminAdvancedPage.css";

/**
 * Connecting a database and backing it up. Its own row rather than a card under
 * Advanced: pointing a large deployment at Postgres is a first-day task, not a
 * knob you go looking for behind a folded group.
 */
export default function AdminDatabasePage() {
  const { t } = useTranslation();
  const { loginEnabled, validateLoginEnabled } = useLoginRequired();
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
    saveSettings,
    isFieldPending,
  } = useAdminSettings<{ datasource?: DatasourceSettingsData }>({
    sectionName: "database",
    enabled: loginEnabled,
    fetchTransformer: async () => {
      const response = await apiClient.get(
        "/api/v1/admin/settings/section/system",
      );
      const systemData = response.data || {};
      const result: {
        datasource?: DatasourceSettingsData;
        _pending?: Record<string, unknown>;
      } = { datasource: systemData.datasource || { ...DEFAULT_DATASOURCE } };
      if (systemData._pending?.datasource) {
        result._pending = { datasource: systemData._pending.datasource };
      }
      return result;
    },
    saveTransformer: (s) => {
      const d = s.datasource;
      return {
        sectionData: {},
        deltaSettings: {
          "system.datasource.enableCustomDatabase": d?.enableCustomDatabase,
          "system.datasource.customDatabaseUrl": d?.customDatabaseUrl,
          "system.datasource.username": d?.username,
          "system.datasource.password": d?.password,
          "system.datasource.type": d?.type,
          "system.datasource.hostName": d?.hostName,
          "system.datasource.port": d?.port,
          "system.datasource.name": d?.name,
        },
      };
    },
  });

  const actualLoading = loginEnabled ? loading : false;
  const { isDirty, resetToSnapshot, markSaved } = useSettingsDirty(
    settings,
    actualLoading,
  );

  // Backups only exist for the embedded database; a custom one is the
  // operator's to back up.
  const isEmbeddedH2 = useMemo(
    () => isEmbeddedH2Database(settings.datasource),
    [settings.datasource],
  );

  const handleSave = async () => {
    if (!validateLoginEnabled()) return;
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

  const handleDiscard = useCallback(() => {
    setSettings(resetToSnapshot());
  }, [resetToSnapshot, setSettings]);

  if (actualLoading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
      </Stack>
    );
  }

  return (
    <div className="settings-section-container">
      <Stack gap="lg" className="settings-section-content">
        <SettingsCard
          id="adminDatabase"
          title={t("admin.settings.database.connection", "Connection")}
          description={t(
            "admin.settings.database.connectionDescription",
            "Point Stirling at an external database instead of the embedded one.",
          )}
          badge={<TierBadge tier="ENTERPRISE" />}
        >
          <DatabaseConfigCard
            settings={settings}
            setSettings={setSettings}
            isFieldPending={isFieldPending}
            loginEnabled={loginEnabled}
          />
        </SettingsCard>
      </Stack>

      <SettingsStickyFooter
        isDirty={isDirty}
        saving={saving}
        loginEnabled={loginEnabled}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />

      <div className="settings-section-content">
        <SettingsCard
          id="adminDatabaseBackups"
          title={t("admin.settings.database.backupTitle", "Backups & Restore")}
          description={t(
            "admin.settings.database.backupDescription",
            "Manage H2 backups directly from the admin console.",
          )}
        >
          <DatabaseBackupsCard isEmbeddedH2={isEmbeddedH2} />
        </SettingsCard>
      </div>

      <RestartConfirmationModal
        opened={restartModalOpened}
        onClose={closeRestartModal}
        onRestart={restartServer}
      />
    </div>
  );
}
