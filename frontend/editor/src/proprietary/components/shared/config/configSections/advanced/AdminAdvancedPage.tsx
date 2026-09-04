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
import apiClient from "@app/services/apiClient";
import { useLoginRequired } from "@app/hooks/useLoginRequired";
import LoginRequiredBanner from "@app/components/shared/config/LoginRequiredBanner";
import {
  AdvancedSettingsData,
  DEFAULT_DATASOURCE,
} from "@app/components/shared/config/configSections/advanced/advancedSettings";
import { AdvancedFeatureFlagsCard } from "@app/components/shared/config/configSections/advanced/AdvancedFeatureFlagsCard";
import { AdvancedProcessingCard } from "@app/components/shared/config/configSections/advanced/AdvancedProcessingCard";
import { AdvancedTempFilesCard } from "@app/components/shared/config/configSections/advanced/AdvancedTempFilesCard";
import { AdvancedProcessExecutorCard } from "@app/components/shared/config/configSections/advanced/AdvancedProcessExecutorCard";
import "@app/components/shared/config/configSections/advanced/AdminAdvancedPage.css";

/**
 * Advanced and Database, previously two nav rows over one object: both read
 * `system` and wrote `system.*` dot-notation deltas, so the split bought two
 * fetches and two drafts of the same data. One page, one draft, one save.
 *
 * Backups & restore stays below the footer because it is not part of the
 * draft: those buttons act on the server the moment they are pressed.
 */
export default function AdminAdvancedPage() {
  const { t } = useTranslation();
  const {
    restartModalOpened,
    showRestartModal,
    closeRestartModal,
    restartServer,
  } = useRestartServer();
  const { loginEnabled, validateLoginEnabled } = useLoginRequired();

  const {
    settings,
    setSettings,
    loading,
    saving,
    saveSettings,
    isFieldPending,
  } = useAdminSettings<AdvancedSettingsData>({
    sectionName: "advanced",
    enabled: loginEnabled,
    fetchTransformer: async (): Promise<
      AdvancedSettingsData & { _pending?: Record<string, unknown> }
    > => {
      const [systemResponse, processExecutorResponse] = await Promise.all([
        apiClient.get("/api/v1/admin/settings/section/system"),
        apiClient.get("/api/v1/admin/settings/section/processExecutor"),
      ]);

      const systemData = systemResponse.data || {};
      const processExecutorData = processExecutorResponse.data || {};

      const result: AdvancedSettingsData & {
        _pending?: Record<string, unknown>;
      } = {
        enableAlphaFunctionality: systemData.enableAlphaFunctionality || false,
        maxDPI: systemData.maxDPI || 0,
        enableUrlToPDF: systemData.enableUrlToPDF || false,
        tessdataDir: systemData.tessdataDir || "",
        disableSanitize: systemData.disableSanitize || false,
        tempFileManagement: systemData.tempFileManagement || {
          baseTmpDir: "",
          libreofficeDir: "",
          systemTempDir: "",
          prefix: "stirling-pdf-",
          maxAgeHours: 24,
          cleanupIntervalMinutes: 30,
          startupCleanup: true,
          cleanupSystemTemp: false,
        },
        processExecutor: processExecutorData || {},
        // The Database row read this same response; a slice, not a third GET.
        datasource: systemData.datasource || { ...DEFAULT_DATASOURCE },
      };

      // Merge pending blocks from both endpoints
      const pendingBlock: Record<string, unknown> = {};
      if (systemData._pending?.enableAlphaFunctionality !== undefined) {
        pendingBlock.enableAlphaFunctionality =
          systemData._pending.enableAlphaFunctionality;
      }
      if (systemData._pending?.maxDPI !== undefined) {
        pendingBlock.maxDPI = systemData._pending.maxDPI;
      }
      if (systemData._pending?.enableUrlToPDF !== undefined) {
        pendingBlock.enableUrlToPDF = systemData._pending.enableUrlToPDF;
      }
      if (systemData._pending?.tessdataDir !== undefined) {
        pendingBlock.tessdataDir = systemData._pending.tessdataDir;
      }
      if (systemData._pending?.disableSanitize !== undefined) {
        pendingBlock.disableSanitize = systemData._pending.disableSanitize;
      }
      if (systemData._pending?.tempFileManagement) {
        pendingBlock.tempFileManagement =
          systemData._pending.tempFileManagement;
      }
      if (systemData._pending?.datasource) {
        pendingBlock.datasource = systemData._pending.datasource;
      }
      if (processExecutorData._pending) {
        pendingBlock.processExecutor = processExecutorData._pending;
      }

      if (Object.keys(pendingBlock).length > 0) {
        result._pending = pendingBlock;
      }

      return result;
    },
    saveTransformer: (settings) => {
      const deltaSettings: Record<string, unknown> = {
        "system.enableAlphaFunctionality": settings.enableAlphaFunctionality,
        "system.maxDPI": settings.maxDPI,
        "system.enableUrlToPDF": settings.enableUrlToPDF,
        "system.tessdataDir": settings.tessdataDir,
        "system.disableSanitize": settings.disableSanitize,
      };

      // Add temp file management settings
      if (settings.tempFileManagement) {
        deltaSettings["system.tempFileManagement.baseTmpDir"] =
          settings.tempFileManagement.baseTmpDir;
        deltaSettings["system.tempFileManagement.libreofficeDir"] =
          settings.tempFileManagement.libreofficeDir;
        deltaSettings["system.tempFileManagement.systemTempDir"] =
          settings.tempFileManagement.systemTempDir;
        deltaSettings["system.tempFileManagement.prefix"] =
          settings.tempFileManagement.prefix;
        deltaSettings["system.tempFileManagement.maxAgeHours"] =
          settings.tempFileManagement.maxAgeHours;
        deltaSettings["system.tempFileManagement.cleanupIntervalMinutes"] =
          settings.tempFileManagement.cleanupIntervalMinutes;
        deltaSettings["system.tempFileManagement.startupCleanup"] =
          settings.tempFileManagement.startupCleanup;
        deltaSettings["system.tempFileManagement.cleanupSystemTemp"] =
          settings.tempFileManagement.cleanupSystemTemp;
      }

      // Add process executor settings
      if (settings.processExecutor?.sessionLimit) {
        Object.entries(settings.processExecutor.sessionLimit).forEach(
          ([key, value]) => {
            deltaSettings[`processExecutor.sessionLimit.${key}`] = value;
          },
        );
      }
      if (settings.processExecutor?.timeoutMinutes) {
        Object.entries(settings.processExecutor.timeoutMinutes).forEach(
          ([key, value]) => {
            deltaSettings[`processExecutor.timeoutMinutes.${key}`] = value;
          },
        );
      }

      // The Database row's eight keys, unchanged. The hook drops any whose
      // value matches the server, so the masked password is never resent.

      return {
        sectionData: {},
        deltaSettings,
      };
    },
  });

  const { isDirty, resetToSnapshot, markSaved } = useSettingsDirty(
    settings,
    loading,
  );

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

  const handleDiscard = useCallback(() => {
    const original = resetToSnapshot();
    setSettings(original);
  }, [resetToSnapshot, setSettings]);

  const actualLoading = loginEnabled ? loading : false;

  if (actualLoading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
      </Stack>
    );
  }

  const card = { settings, setSettings, isFieldPending, loginEnabled };

  return (
    <div className="settings-section-container">
      <Stack gap="lg" className="settings-section-content">
        <LoginRequiredBanner show={!loginEnabled} />

        <SettingsCard
          id="adminAdvancedFeatures"
          title={t("admin.settings.advanced.features", "Feature Flags")}
        >
          <AdvancedFeatureFlagsCard {...card} />
        </SettingsCard>

        <SettingsCard
          id="adminAdvancedProcessing"
          title={t("admin.settings.advanced.processing", "Processing")}
        >
          <AdvancedProcessingCard {...card} />
        </SettingsCard>

        <SettingsCard
          id="adminAdvancedTempFiles"
          title={t(
            "admin.settings.advanced.tempFileManagement.label",
            "Temp File Management",
          )}
        >
          <AdvancedTempFilesCard {...card} />
        </SettingsCard>

        <SettingsCard
          id="adminAdvancedProcessExecutor"
          title={t(
            "admin.settings.advanced.processExecutor.label",
            "Process Executor Limits",
          )}
        >
          <AdvancedProcessExecutorCard {...card} />
        </SettingsCard>
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
