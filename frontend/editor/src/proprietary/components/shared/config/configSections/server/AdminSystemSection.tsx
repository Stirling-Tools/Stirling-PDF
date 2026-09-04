import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { Badge, Loader, Stack } from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { alert } from "@app/components/toast";
import RestartConfirmationModal from "@app/components/shared/config/RestartConfirmationModal";
import { useRestartServer } from "@app/components/shared/config/useRestartServer";
import { useAdminSettings } from "@app/hooks/useAdminSettings";
import { useSettingsDirty } from "@app/hooks/useSettingsDirty";
import { SettingsStickyFooter } from "@app/components/shared/config/SettingsStickyFooter";
import apiClient from "@app/services/apiClient";
import { useLoginRequired } from "@app/hooks/useLoginRequired";
import LoginRequiredBanner from "@app/components/shared/config/LoginRequiredBanner";
import { usePreferences } from "@app/contexts/PreferencesContext";
import { useUnsavedChanges } from "@app/contexts/UnsavedChangesContext";
import { qk } from "@app/query/keys";
import { toUnderscoreLanguages } from "@app/i18n";
import type {
  EndpointsSettingsData,
  FolderAccessSettingsData,
  GeneralSettingsData,
  McpSettingsData,
  StorageSharingSettingsData,
  UiDefaultsSettingsData,
} from "@app/components/shared/config/configSections/server/serverSettings";
import { SystemCard } from "@app/components/shared/config/configSections/server/SystemCard";
import { UserDefaultsCard } from "@app/components/shared/config/configSections/server/UserDefaultsCard";
import { EndpointManagementCard } from "@app/components/shared/config/configSections/server/EndpointManagementCard";
import { StorageSharingCard } from "@app/components/shared/config/configSections/server/StorageSharingCard";
import { FolderAccessCard } from "@app/components/shared/config/configSections/server/FolderAccessCard";
import { CustomPathsCard } from "@app/components/shared/config/configSections/server/CustomPathsCard";
import { CustomMetadataCard } from "@app/components/shared/config/configSections/server/CustomMetadataCard";
import { ServerCertificateCard } from "@app/components/shared/config/configSections/server/ServerCertificateCard";
import { McpCard } from "@app/components/shared/config/configSections/server/McpCard";
import "@app/components/shared/config/configSections/server/AdminSystemSection.css";

/** Every admin section this page drafts, and so every key a save invalidates. */
const SECTION_NAMES = [
  "general",
  "ui",
  "endpoints",
  "storage",
  "policies",
  "mcp",
] as const;

/**
 * The server settings, previously six nav rows. Six sections' drafts sit
 * under one Save bar, so the page owns one composite dirty flag rather than a
 * flag per hook, and the cards below are presentational.
 *
 * Two things the split rows got away with and this page cannot:
 * saves run one after another (general and mcp both PUT the flat settings
 * endpoint), and a save refetches every section, because the System card writes
 * system.frontendUrl that the storage section reads under its own key.
 */
export default function AdminSystemSection() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { loginEnabled, validateLoginEnabled } = useLoginRequired();
  const {
    restartModalOpened,
    showRestartModal,
    closeRestartModal,
    restartServer,
  } = useRestartServer();
  const { updatePreference } = usePreferences();
  const { markClean } = useUnsavedChanges();
  // The folder-access entry box: page state so Discard clears it with the draft.
  const [newRoot, setNewRoot] = useState("");

  const {
    settings: general,
    setSettings: setGeneral,
    loading: generalLoading,
    saving: generalSaving,
    saveSettings: saveGeneral,
    isFieldPending: isGeneralFieldPending,
  } = useAdminSettings<GeneralSettingsData>({
    sectionName: "general",
    enabled: loginEnabled,
    fetchTransformer: async (): Promise<
      GeneralSettingsData & { _pending?: Record<string, unknown> }
    > => {
      const [uiResponse, systemResponse, premiumResponse] = await Promise.all([
        apiClient.get("/api/v1/admin/settings/section/ui"),
        apiClient.get("/api/v1/admin/settings/section/system"),
        apiClient.get("/api/v1/admin/settings/section/premium"),
      ]);

      const ui = { ...(uiResponse.data || {}) };
      const system = { ...(systemResponse.data || {}) };
      const premium = { ...(premiumResponse.data || {}) };

      ui.languages = Array.isArray(ui.languages)
        ? toUnderscoreLanguages(ui.languages)
        : [];

      const pipelinePaths = system.customPaths?.pipeline || {};
      const watchedFoldersDirs = Array.isArray(pipelinePaths.watchedFoldersDirs)
        ? pipelinePaths.watchedFoldersDirs
        : [];
      const normalizedWatchedFoldersDirs =
        watchedFoldersDirs.length > 0
          ? watchedFoldersDirs
          : pipelinePaths.watchedFoldersDir
            ? [pipelinePaths.watchedFoldersDir]
            : [];

      const result: GeneralSettingsData & {
        _pending?: Record<string, unknown>;
      } = {
        ui,
        system,
        // Was the Features row's own hook and its own GET of this same section.
        serverCertificate: system.serverCertificate || {
          enabled: true,
          organizationName: "Stirling PDF Inc",
          validity: 365,
          regenerateOnStartup: false,
        },
        customPaths: {
          ...(system.customPaths || {}),
          pipeline: {
            ...pipelinePaths,
            pipelineDir: pipelinePaths.pipelineDir || "",
            watchedFoldersDir: pipelinePaths.watchedFoldersDir || "",
            watchedFoldersDirs: normalizedWatchedFoldersDirs,
            finishedFoldersDir: pipelinePaths.finishedFoldersDir || "",
          },
          operations: {
            ...(system.customPaths?.operations || {}),
            weasyprint: system.customPaths?.operations?.weasyprint || "",
            unoconvert: system.customPaths?.operations?.unoconvert || "",
          },
        },
        customMetadata: premium.proFeatures?.customMetadata || {
          autoUpdateMetadata: false,
          author: "",
          creator: "",
          producer: "",
        },
      };

      // Merge pending blocks from all three endpoints
      const pendingBlock: Record<string, unknown> = {};
      if (ui._pending) {
        pendingBlock.ui = ui._pending;
      }
      if (system._pending) {
        pendingBlock.system = system._pending;
      }
      if (system._pending?.customPaths) {
        pendingBlock.customPaths = system._pending.customPaths;
      }
      if (system._pending?.serverCertificate) {
        pendingBlock.serverCertificate = system._pending.serverCertificate;
      }
      if (premium._pending?.proFeatures?.customMetadata) {
        pendingBlock.customMetadata =
          premium._pending.proFeatures.customMetadata;
      }

      if (Object.keys(pendingBlock).length > 0) {
        result._pending = pendingBlock;
      }

      return result;
    },
    saveTransformer: (settings: GeneralSettingsData) => {
      const deltaSettings: Record<string, unknown> = {
        // UI settings
        "ui.appNameNavbar": settings.ui?.appNameNavbar,
        "ui.languages": settings.ui?.languages,
        "ui.logoStyle": settings.ui?.logoStyle,
        "ui.hideDisabledTools.googleDrive":
          settings.ui?.hideDisabledTools?.googleDrive,
        "ui.hideDisabledTools.mobileQRScanner":
          settings.ui?.hideDisabledTools?.mobileQRScanner,
        // System settings
        "system.defaultLocale": settings.system?.defaultLocale,
        "system.showUpdate": settings.system?.showUpdate,
        "system.showUpdateOnlyAdmin": settings.system?.showUpdateOnlyAdmin,
        "system.customHTMLFiles": settings.system?.customHTMLFiles,
        "system.fileUploadLimit": settings.system?.fileUploadLimit,
        "system.frontendUrl": settings.system?.frontendUrl,
        // Premium custom metadata
        "premium.proFeatures.customMetadata.autoUpdateMetadata":
          settings.customMetadata?.autoUpdateMetadata,
        "premium.proFeatures.customMetadata.author":
          settings.customMetadata?.author,
        "premium.proFeatures.customMetadata.creator":
          settings.customMetadata?.creator,
        "premium.proFeatures.customMetadata.producer":
          settings.customMetadata?.producer,
      };

      if (settings.serverCertificate) {
        deltaSettings["system.serverCertificate.enabled"] =
          settings.serverCertificate.enabled;
        deltaSettings["system.serverCertificate.organizationName"] =
          settings.serverCertificate.organizationName;
        deltaSettings["system.serverCertificate.validity"] =
          settings.serverCertificate.validity;
        deltaSettings["system.serverCertificate.regenerateOnStartup"] =
          settings.serverCertificate.regenerateOnStartup;
      }

      if (settings.customPaths) {
        deltaSettings["system.customPaths.pipeline.pipelineDir"] =
          settings.customPaths?.pipeline?.pipelineDir;
        deltaSettings["system.customPaths.pipeline.watchedFoldersDir"] =
          settings.customPaths?.pipeline?.watchedFoldersDir;
        deltaSettings["system.customPaths.pipeline.watchedFoldersDirs"] =
          settings.customPaths?.pipeline?.watchedFoldersDirs;
        deltaSettings["system.customPaths.pipeline.finishedFoldersDir"] =
          settings.customPaths?.pipeline?.finishedFoldersDir;
        deltaSettings["system.customPaths.operations.weasyprint"] =
          settings.customPaths?.operations?.weasyprint;
        deltaSettings["system.customPaths.operations.unoconvert"] =
          settings.customPaths?.operations?.unoconvert;
      }

      return {
        sectionData: {},
        deltaSettings,
      };
    },
  });

  const {
    settings: uiDefaults,
    setSettings: setUiDefaults,
    loading: uiLoading,
    saving: uiSaving,
    saveSettings: saveUiDefaults,
    isFieldPending: isUiFieldPending,
  } = useAdminSettings<UiDefaultsSettingsData>({
    sectionName: "ui",
    enabled: loginEnabled,
  });

  const {
    settings: endpoints,
    setSettings: setEndpoints,
    loading: endpointsLoading,
    saving: endpointsSaving,
    saveSettings: saveEndpoints,
    isFieldPending: isEndpointsFieldPending,
  } = useAdminSettings<EndpointsSettingsData>({
    sectionName: "endpoints",
    enabled: loginEnabled,
  });

  const {
    settings: storage,
    setSettings: setStorage,
    loading: storageLoading,
    saving: storageSaving,
    saveSettings: saveStorage,
    isFieldPending: isStorageFieldPending,
  } = useAdminSettings<StorageSharingSettingsData>({
    sectionName: "storage",
    enabled: loginEnabled,
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

  const {
    settings: folderAccess,
    setSettings: setFolderAccess,
    loading: policiesLoading,
    saving: policiesSaving,
    saveSettings: savePolicies,
    isFieldPending: isPoliciesFieldPending,
  } = useAdminSettings<FolderAccessSettingsData>({
    sectionName: "policies",
    enabled: loginEnabled,
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

  // Every hook's loading, and the ternary because a disabled query never
  // settles: a composite draft always has keys, so this is the only guard left
  // between useSettingsDirty and a snapshot taken mid-fetch.
  const loading = loginEnabled
    ? generalLoading ||
      uiLoading ||
      endpointsLoading ||
      storageLoading ||
      policiesLoading ||
      mcpLoading
    : false;

  const composite = useMemo(
    () => ({ general, uiDefaults, endpoints, storage, folderAccess, mcp }),
    [general, uiDefaults, endpoints, storage, folderAccess, mcp],
  );

  const { isDirty, resetToSnapshot, markSaved } = useSettingsDirty(
    composite,
    loading,
  );

  // Sync local preference with server setting on initial load
  useEffect(() => {
    if (loading || !loginEnabled || !general.ui?.logoStyle) return;

    // This ensures localStorage always reflects the server's authoritative value
    updatePreference("logoVariant", general.ui.logoStyle);
  }, [loading, loginEnabled, general.ui?.logoStyle, updatePreference]);

  // Handle hash navigation for deep linking to specific fields
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
    // Block save if login is disabled
    if (!validateLoginEnabled()) {
      return;
    }

    const results: PromiseSettledResult<void>[] = [];
    for (const save of [
      saveGeneral,
      saveUiDefaults,
      saveEndpoints,
      saveStorage,
      savePolicies,
      saveMcp,
    ]) {
      // Sequential, not Promise.all: general and mcp PUT the same flat settings
      // endpoint and would overwrite each other's merge. A clean section's save
      // is a no-op, so running all six costs nothing.
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

    // Each hook invalidates only its own key, but these sections read each
    // other: storage decides whether Share Links is usable from the
    // system.frontendUrl the System card just wrote.
    for (const section of SECTION_NAMES) {
      queryClient.invalidateQueries({ queryKey: qk.adminSection(section) });
    }

    // Update local preference after successful save so the app reflects the saved logo style
    if (general.ui?.logoStyle) {
      updatePreference("logoVariant", general.ui.logoStyle);
    }

    markSaved();
    markClean();
    showRestartModal();
  };

  const handleDiscard = useCallback(() => {
    const original = resetToSnapshot();
    setGeneral(original.general);
    setUiDefaults(original.uiDefaults);
    setEndpoints(original.endpoints);
    setStorage(original.storage);
    setFolderAccess(original.folderAccess);
    setMcp(original.mcp);
    setNewRoot("");
  }, [
    resetToSnapshot,
    setGeneral,
    setUiDefaults,
    setEndpoints,
    setStorage,
    setFolderAccess,
    setMcp,
  ]);

  if (loading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
      </Stack>
    );
  }

  const generalCard = {
    settings: general,
    setSettings: setGeneral,
    isFieldPending: isGeneralFieldPending,
    loginEnabled,
  };

  return (
    <div className="settings-section-container">
      <Stack gap="lg" className="settings-section-content">
        <LoginRequiredBanner show={!loginEnabled} />

        <section className="admin-system__card">
          <h2 className="admin-system__heading" id="adminGeneral">
            {t("admin.settings.general.system", "System")}
          </h2>
          <SystemCard {...generalCard} />
        </section>

        <section className="admin-system__card">
          <h2 className="admin-system__heading" id="adminUserDefaults">
            {t(
              "admin.settings.endpoints.userDefaults",
              "User Preference Defaults",
            )}
          </h2>
          <UserDefaultsCard
            settings={uiDefaults}
            setSettings={setUiDefaults}
            isFieldPending={isUiFieldPending}
            loginEnabled={loginEnabled}
          />
        </section>

        <section className="admin-system__card">
          <h2 className="admin-system__heading" id="adminEndpoints">
            {t("admin.settings.endpoints.management", "Endpoint Management")}
          </h2>
          <p className="admin-system__description">
            {t(
              "admin.settings.endpoints.description",
              "Turn individual tools or whole groups off for everyone on this server.",
            )}
          </p>
          <EndpointManagementCard
            settings={endpoints}
            setSettings={setEndpoints}
            isFieldPending={isEndpointsFieldPending}
            loginEnabled={loginEnabled}
          />
        </section>

        <section className="admin-system__card">
          <h2 className="admin-system__heading" id="adminStorageSharing">
            {t(
              "settings.configuration.storageSharing",
              "File Storage & Sharing",
            )}
            {/* The retired row wore this badge; a merged row cannot. */}
            <Badge component="span" color="orange" size="sm">
              {t("toolPanel.alpha", "Alpha")}
            </Badge>
          </h2>
          <p className="admin-system__description">
            {t(
              "admin.settings.storage.description",
              "Where files are stored, and whether people can share them by link or email.",
            )}
          </p>
          <StorageSharingCard
            settings={storage}
            setSettings={setStorage}
            isFieldPending={isStorageFieldPending}
            loginEnabled={loginEnabled}
          />
        </section>

        <section className="admin-system__card">
          <h2 className="admin-system__heading" id="adminFolderAccess">
            {t("settings.configuration.folderAccess", "Folder Access")}
          </h2>
          <p className="admin-system__description">
            {t(
              "admin.settings.folderAccess.description",
              "Directories that folder sources and folder outputs are allowed to read from and write to.",
            )}
          </p>
          <FolderAccessCard
            settings={folderAccess}
            setSettings={setFolderAccess}
            isFieldPending={isPoliciesFieldPending}
            loginEnabled={loginEnabled}
            newRoot={newRoot}
            setNewRoot={setNewRoot}
          />
        </section>

        <section className="admin-system__card">
          <h2 className="admin-system__heading" id="adminGeneralCustomPaths">
            {t("admin.settings.general.customPaths.label", "Custom Paths")}
          </h2>
          <CustomPathsCard {...generalCard} />
        </section>

        <section className="admin-system__card">
          <h2 className="admin-system__heading" id="adminGeneralCustomMetadata">
            {t(
              "admin.settings.general.customMetadata.label",
              "Custom Metadata",
            )}
            <Badge
              component="span"
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
          </h2>
          <CustomMetadataCard {...generalCard} />
        </section>

        <section className="admin-system__card">
          <h2 className="admin-system__heading" id="adminFeatures">
            {t(
              "admin.settings.features.serverCertificate.label",
              "Server Certificate",
            )}
            <Badge
              component="span"
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
          </h2>
          <p className="admin-system__description">
            {t(
              "admin.settings.features.description",
              "Configure optional features and functionality.",
            )}
          </p>
          <ServerCertificateCard {...generalCard} />
        </section>

        <section className="admin-system__card">
          <h2 className="admin-system__heading" id="adminMcp">
            {t("settings.configuration.mcp", "MCP Server")}
          </h2>
          <p className="admin-system__description">
            {t(
              "admin.settings.mcp.description",
              "Expose this server's tools to MCP clients, and choose which ones.",
            )}
          </p>
          <McpCard
            settings={mcp}
            setSettings={setMcp}
            isFieldPending={isMcpFieldPending}
            loginEnabled={loginEnabled}
          />
        </section>
      </Stack>

      <SettingsStickyFooter
        isDirty={isDirty}
        saving={
          generalSaving ||
          uiSaving ||
          endpointsSaving ||
          storageSaving ||
          policiesSaving ||
          mcpSaving
        }
        loginEnabled={loginEnabled}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />

      {/* Restart Confirmation Modal */}
      <RestartConfirmationModal
        opened={restartModalOpened}
        onClose={closeRestartModal}
        onRestart={restartServer}
      />
    </div>
  );
}
