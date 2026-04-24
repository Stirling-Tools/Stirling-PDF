import React, { useState, useEffect } from "react";
import {
  Paper,
  Stack,
  Switch,
  Text,
  Tooltip,
  NumberInput,
  SegmentedControl,
  Select,
  Code,
  Group,
  Anchor,
  ActionIcon,
  Button,
  Badge,
  Alert,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { usePreferences } from "@app/contexts/PreferencesContext";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import type { ToolPanelMode } from "@app/constants/toolPanel";
import type {
  StartupView,
  ViewerZoomSetting,
} from "@app/services/preferencesService";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";
import LocalIcon from "@app/components/shared/LocalIcon";
import { updateService, UpdateSummary } from "@app/services/updateService";
import UpdateModal from "@app/components/shared/UpdateModal";
import type {
  DesktopInstallState,
  DesktopInstallProgress,
  DesktopInstallActions,
  DesktopInstallCanInstall,
} from "@app/components/shared/UpdateModal";
import { useFrontendVersionInfo } from "@app/hooks/useFrontendVersionInfo";

const DEFAULT_AUTO_UNZIP_FILE_LIMIT = 4;
const BANNER_DISMISSED_KEY = "stirlingpdf_features_banner_dismissed";

/**
 * Desktop-only: user-facing update policy control, rendered inside the
 * Software Updates section alongside the version info. Passed from the
 * desktop GeneralSection override so this core component doesn't have to
 * import any Tauri APIs directly.
 */
export interface DesktopUpdateModeControl {
  /** Current mode. */
  mode: "prompt" | "auto" | "disabled";
  /** `true` when the mode was written by a provisioning file — disables the control. */
  locked: boolean;
  /** Called when the user picks a new mode. Async: surface errors via toast. */
  onChange: (mode: "prompt" | "auto" | "disabled") => Promise<void> | void;
}

interface GeneralSectionProps {
  hideTitle?: boolean;
  hideUpdateSection?: boolean;
  hideAdminBanner?: boolean;
  /** Desktop-only: Tauri updater install state, passed from the desktop override. */
  desktopInstall?: {
    state: DesktopInstallState;
    progress: DesktopInstallProgress | null;
    errorMessage: string | null;
    tauriInstallReady: boolean;
    /** Result of the `can_install_updates` probe, used to show an inline
     *  warning when msiexec would need UAC elevation this user doesn't have. */
    canInstall?: DesktopInstallCanInstall | null;
    actions: DesktopInstallActions;
  };
  /** Desktop-only: update-mode toggle (prompt/auto/disabled). */
  desktopUpdateMode?: DesktopUpdateModeControl;
}

const GeneralSection: React.FC<GeneralSectionProps> = ({
  hideTitle = false,
  hideUpdateSection = false,
  hideAdminBanner = false,
  desktopInstall,
  desktopUpdateMode,
}) => {
  const { t } = useTranslation();
  const { preferences, updatePreference } = usePreferences();
  const { config } = useAppConfig();
  const [fileLimitInput, setFileLimitInput] = useState<number | string>(
    preferences.autoUnzipFileLimit,
  );
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    // Check localStorage on mount
    return localStorage.getItem(BANNER_DISMISSED_KEY) === "true";
  });
  const [updateSummary, setUpdateSummary] = useState<UpdateSummary | null>(
    null,
  );
  const [updateModalOpened, setUpdateModalOpened] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const { appVersion, mismatchVersion } = useFrontendVersionInfo(
    config?.appVersion,
  );
  const frontendVersionLabel = appVersion ?? t("common.loading", "Loading..."); // null = loading, shown only when appVersion !== undefined

  // Sync local state with preference changes
  useEffect(() => {
    setFileLimitInput(preferences.autoUnzipFileLimit);
  }, [preferences.autoUnzipFileLimit]);

  // The version to use for update checks — on desktop use the Tauri app version,
  // falling back to the backend version
  const currentVersion = appVersion ?? config?.appVersion ?? null;

  // Check for updates on mount
  useEffect(() => {
    if (currentVersion) {
      checkForUpdate();
    }
  }, [currentVersion, config?.machineType]);

  const checkForUpdate = async () => {
    if (!currentVersion) return;

    setCheckingUpdate(true);

    const machineInfo = {
      machineType: config?.machineType ?? "unknown",
      activeSecurity: config?.activeSecurity ?? false,
      licenseType: config?.license ?? "NORMAL",
    };

    const summary = await updateService.getUpdateSummary(
      currentVersion,
      machineInfo,
    );

    if (
      summary?.latest_version &&
      updateService.compareVersions(summary.latest_version, currentVersion) > 0
    ) {
      setUpdateSummary(summary);
    } else {
      setUpdateSummary(null);
    }

    setCheckingUpdate(false);
  };

  // Build desktop install props for the UpdateModal (only when provided by desktop override)
  const desktopInstallProps = desktopInstall?.tauriInstallReady
    ? {
        state: desktopInstall.state,
        progress: desktopInstall.progress,
        errorMessage: desktopInstall.errorMessage,
        canInstall: desktopInstall.canInstall,
        actions: desktopInstall.actions,
      }
    : undefined;

  // Check if login is disabled
  const loginDisabled = !config?.enableLogin;

  const handleDismissBanner = () => {
    setBannerDismissed(true);
    localStorage.setItem(BANNER_DISMISSED_KEY, "true");
  };

  return (
    <Stack gap="lg">
      {!hideTitle && (
        <div>
          <Text fw={600} size="lg">
            {t("settings.general.title", "General")}
          </Text>
          <Text size="sm" c="dimmed">
            {t(
              "settings.general.description",
              "Configure general application preferences.",
            )}
          </Text>
        </div>
      )}

      {!hideAdminBanner && loginDisabled && !bannerDismissed && (
        <Paper
          withBorder
          p="md"
          radius="md"
          style={{
            background: "var(--mantine-color-blue-0)",
            position: "relative",
          }}
        >
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            style={{ position: "absolute", top: "0.5rem", right: "0.5rem" }}
            onClick={handleDismissBanner}
            aria-label={t("settings.general.enableFeatures.dismiss", "Dismiss")}
          >
            <LocalIcon icon="close-rounded" width="1rem" height="1rem" />
          </ActionIcon>
          <Stack gap="sm">
            <Group gap="xs">
              <LocalIcon
                icon="admin-panel-settings-rounded"
                width="1.2rem"
                height="1.2rem"
                style={{ color: "var(--mantine-color-blue-6)" }}
              />
              <Text
                fw={600}
                size="sm"
                style={{ color: "var(--mantine-color-blue-9)" }}
              >
                {t(
                  "settings.general.enableFeatures.title",
                  "For System Administrators",
                )}
              </Text>
            </Group>
            <Text size="sm" c="dimmed">
              {t(
                "settings.general.enableFeatures.intro",
                "Enable user authentication, team management, and workspace features for your organization.",
              )}
            </Text>
            <Group gap="xs" wrap="wrap">
              <Text size="sm" c="dimmed">
                {t("settings.general.enableFeatures.action", "Configure")}
              </Text>
              <Code>SECURITY_ENABLELOGIN=true</Code>
              <Text size="sm" c="dimmed">
                {t("settings.general.enableFeatures.and", "and")}
              </Text>
              <Code>DISABLE_ADDITIONAL_FEATURES=false</Code>
            </Group>
            <Text size="xs" c="dimmed" fs="italic">
              {t(
                "settings.general.enableFeatures.benefit",
                "Enables user roles, team collaboration, admin controls, and enterprise features.",
              )}
            </Text>
            <Anchor
              href="https://docs.stirlingpdf.com/Configuration/System%20and%20Security/"
              target="_blank"
              size="sm"
              style={{ color: "var(--mantine-color-blue-6)" }}
            >
              {t(
                "settings.general.enableFeatures.learnMore",
                "Learn more in documentation",
              )}{" "}
              →
            </Anchor>
          </Stack>
        </Paper>
      )}

      {/* Update Check Section — show when backend version is known OR in desktop mode (Tauri version is always available) */}
      {!hideUpdateSection && (config?.appVersion || !!desktopInstall) && (
        <Paper withBorder p="md" radius="md">
          <Stack gap="md">
            <div>
              <Group justify="space-between" align="center">
                <div>
                  <Text fw={600} size="sm">
                    {t("settings.general.updates.title", "Software Updates")}
                  </Text>
                  <Text size="xs" c="dimmed" mt={4}>
                    {t(
                      "settings.general.updates.description",
                      "Check for updates and view version information",
                    )}
                  </Text>
                </div>
                {updateSummary && (
                  <Badge
                    color={
                      updateSummary.max_priority === "urgent" ? "red" : "blue"
                    }
                    variant="filled"
                  >
                    {updateSummary.max_priority === "urgent"
                      ? t("update.urgentUpdateAvailable", "Urgent Update")
                      : t("update.updateAvailable", "Update Available")}
                  </Badge>
                )}
              </Group>
            </div>
            {appVersion !== undefined && (
              <Group justify="space-between" align="center">
                <div>
                  <Text size="sm" c="dimmed">
                    {t(
                      "settings.general.updates.currentFrontendVersion",
                      "Current Frontend Version",
                    )}
                    :{" "}
                    <Text component="span" fw={500}>
                      {frontendVersionLabel}
                    </Text>
                  </Text>
                  {mismatchVersion && (
                    <Text size="sm" c="red" mt={4}>
                      {t(
                        "settings.general.updates.versionMismatch",
                        "Warning: A mismatch has been detected between the client version and the AppConfig version. Using different versions can lead to compatibility issues, errors, and security risks. Please ensure that server and client are using the same version.",
                      )}
                    </Text>
                  )}
                </div>
              </Group>
            )}
            <Group justify="space-between" align="center">
              <div>
                {config?.appVersion && (
                  <Text size="sm" c="dimmed">
                    {t(
                      "settings.general.updates.currentBackendVersion",
                      "Current Backend Version",
                    )}
                    :{" "}
                    <Text component="span" fw={500}>
                      {config.appVersion}
                    </Text>
                  </Text>
                )}
                {updateSummary && (
                  <Text size="sm" c="dimmed" mt={4}>
                    {t(
                      "settings.general.updates.latestVersion",
                      "Latest Version",
                    )}
                    :{" "}
                    <Text component="span" fw={500} c="blue">
                      {updateSummary.latest_version}
                    </Text>
                  </Text>
                )}
              </div>
              <Group gap="sm">
                <Button
                  size="sm"
                  variant="default"
                  onClick={checkForUpdate}
                  loading={checkingUpdate}
                  disabled={!currentVersion}
                  leftSection={
                    <LocalIcon
                      icon="refresh-rounded"
                      width="1rem"
                      height="1rem"
                    />
                  }
                >
                  {t(
                    "settings.general.updates.checkForUpdates",
                    "Check for Updates",
                  )}
                </Button>
                {updateSummary && (
                  <Button
                    size="sm"
                    color={
                      updateSummary.max_priority === "urgent" ? "red" : "blue"
                    }
                    onClick={() => setUpdateModalOpened(true)}
                    leftSection={
                      <LocalIcon
                        icon="system-update-alt-rounded"
                        width="1rem"
                        height="1rem"
                      />
                    }
                  >
                    {t("settings.general.updates.viewDetails", "View Details")}
                  </Button>
                )}
              </Group>
            </Group>

            {/* Desktop-only: update behaviour selector (prompt / auto / disabled).
                Rendered disabled with a "Managed by administrator" hint when the
                mode was pinned by a provisioning file. */}
            {desktopUpdateMode && (
              <Stack gap="xs">
                <Group gap="xs" align="center">
                  <Text fw={600} size="sm">
                    {t(
                      "settings.general.updates.updateBehavior",
                      "Update behavior",
                    )}
                  </Text>
                  {desktopUpdateMode.locked && (
                    // `color="gray" variant="light"` rendered as near-invisible
                    // light-on-dark in dark mode. `blue light` has enough
                    // contrast in both themes to read clearly without being
                    // shouty.
                    <Badge color="blue" variant="light" size="sm" radius="sm">
                      {t(
                        "settings.general.updates.managedByAdmin",
                        "Managed by administrator",
                      )}
                    </Badge>
                  )}
                </Group>
                <Text size="xs" c="dimmed">
                  {desktopUpdateMode.locked
                    ? t(
                        "settings.general.updates.updateBehaviorLockedDescription",
                        "Your administrator has configured how Stirling-PDF handles updates on this machine. Contact them to change this.",
                      )
                    : t(
                        "settings.general.updates.updateBehaviorDescription",
                        "Choose whether to prompt before installing updates, install them automatically, or skip update checks entirely.",
                      )}
                </Text>
                <Select
                  disabled={desktopUpdateMode.locked}
                  value={desktopUpdateMode.mode}
                  onChange={(value) => {
                    if (!value) return;
                    void desktopUpdateMode.onChange(
                      value as "prompt" | "auto" | "disabled",
                    );
                  }}
                  data={[
                    {
                      value: "prompt",
                      label: t(
                        "settings.general.updates.modePrompt",
                        "Ask me before installing updates",
                      ),
                    },
                    {
                      value: "auto",
                      label: t(
                        "settings.general.updates.modeAuto",
                        "Install updates automatically",
                      ),
                    },
                    {
                      value: "disabled",
                      label: t(
                        "settings.general.updates.modeDisabled",
                        "Don't check for updates",
                      ),
                    },
                  ]}
                  maw={360}
                />
              </Stack>
            )}

            {updateSummary?.any_breaking && (
              <Alert
                color="orange"
                title={t(
                  "update.breakingChangesDetected",
                  "Breaking Changes Detected",
                )}
                styles={{
                  title: { fontWeight: 600 },
                }}
              >
                <Text size="sm">
                  {t(
                    "update.breakingChangesMessage",
                    "Some versions contain breaking changes. Please review the migration guides before updating.",
                  )}
                </Text>
              </Alert>
            )}
          </Stack>
        </Paper>
      )}

      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <Text fw={500} size="sm">
                {t(
                  "settings.general.defaultToolPickerMode",
                  "Default tool picker mode",
                )}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t(
                  "settings.general.defaultToolPickerModeDescription",
                  "Choose whether the tool picker opens in fullscreen or sidebar by default",
                )}
              </Text>
            </div>
            <SegmentedControl
              value={preferences.defaultToolPanelMode}
              onChange={(val: string) =>
                updatePreference("defaultToolPanelMode", val as ToolPanelMode)
              }
              data={[
                {
                  label: t("settings.general.mode.sidebar", "Sidebar"),
                  value: "sidebar",
                },
                {
                  label: t("settings.general.mode.fullscreen", "Fullscreen"),
                  value: "fullscreen",
                },
              ]}
            />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <Text fw={500} size="sm">
                {t(
                  "settings.general.defaultStartupView",
                  "Default view on launch",
                )}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t(
                  "settings.general.defaultStartupViewDescription",
                  "Choose which tab is active in the left column when the app starts",
                )}
              </Text>
            </div>
            <SegmentedControl
              value={preferences.defaultStartupView}
              onChange={(val: string) =>
                updatePreference("defaultStartupView", val as StartupView)
              }
              data={[
                {
                  label: t("settings.general.startupView.tools", "Tools"),
                  value: "tools",
                },
                {
                  label: t("settings.general.startupView.read", "Reader"),
                  value: "read",
                },
                {
                  label: t("settings.general.startupView.automate", "Automate"),
                  value: "automate",
                },
              ]}
            />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <Text fw={500} size="sm">
                {t("settings.general.defaultViewerZoom", "Default reader zoom")}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t(
                  "settings.general.defaultViewerZoomDescription",
                  "Set the default zoom level when opening PDFs in the reader",
                )}
              </Text>
            </div>
            <Select
              value={preferences.defaultViewerZoom}
              onChange={(val: string | null) => {
                if (val)
                  updatePreference(
                    "defaultViewerZoom",
                    val as ViewerZoomSetting,
                  );
              }}
              data={[
                {
                  label: t("settings.general.zoomLevel.auto", "Auto"),
                  value: "auto",
                },
                {
                  label: t("settings.general.zoomLevel.fitWidth", "Fit width"),
                  value: "fitWidth",
                },
                {
                  label: t("settings.general.zoomLevel.fitPage", "Fit page"),
                  value: "fitPage",
                },
                { label: "50%", value: "50" },
                { label: "75%", value: "75" },
                { label: "100%", value: "100" },
                { label: "125%", value: "125" },
                { label: "150%", value: "150" },
                { label: "200%", value: "200" },
              ]}
              style={{ width: 140 }}
              allowDeselect={false}
              comboboxProps={{
                withinPortal: true,
                zIndex: Z_INDEX_OVER_CONFIG_MODAL,
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <Text fw={500} size="sm">
                {t(
                  "settings.general.hideUnavailableTools",
                  "Hide unavailable tools",
                )}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t(
                  "settings.general.hideUnavailableToolsDescription",
                  "Remove tools that have been disabled by your server instead of showing them greyed out.",
                )}
              </Text>
            </div>
            <Switch
              checked={preferences.hideUnavailableTools}
              onChange={(event) =>
                updatePreference(
                  "hideUnavailableTools",
                  event.currentTarget.checked,
                )
              }
            />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <Text fw={500} size="sm">
                {t(
                  "settings.general.hideUnavailableConversions",
                  "Hide unavailable conversions",
                )}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t(
                  "settings.general.hideUnavailableConversionsDescription",
                  "Remove disabled conversion options in the Convert tool instead of showing them greyed out.",
                )}
              </Text>
            </div>
            <Switch
              checked={preferences.hideUnavailableConversions}
              onChange={(event) =>
                updatePreference(
                  "hideUnavailableConversions",
                  event.currentTarget.checked,
                )
              }
            />
          </div>
          <Tooltip
            label={t(
              "settings.general.autoUnzipTooltip",
              "Automatically extract ZIP files returned from API operations. Disable to keep ZIP files intact. This does not affect automation workflows.",
            )}
            multiline
            w={300}
            withArrow
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "help",
              }}
            >
              <div>
                <Text fw={500} size="sm">
                  {t("settings.general.autoUnzip", "Auto-unzip API responses")}
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  {t(
                    "settings.general.autoUnzipDescription",
                    "Automatically extract files from ZIP responses",
                  )}
                </Text>
              </div>
              <Switch
                checked={preferences.autoUnzip}
                onChange={(event) =>
                  updatePreference("autoUnzip", event.currentTarget.checked)
                }
              />
            </div>
          </Tooltip>

          <Tooltip
            label={t(
              "settings.general.autoUnzipFileLimitTooltip",
              "Only unzip if the ZIP contains this many files or fewer. Set higher to extract larger ZIPs.",
            )}
            multiline
            w={300}
            withArrow
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "help",
              }}
            >
              <div>
                <Text fw={500} size="sm">
                  {t(
                    "settings.general.autoUnzipFileLimit",
                    "Auto-unzip file limit",
                  )}
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  {t(
                    "settings.general.autoUnzipFileLimitDescription",
                    "Maximum number of files to extract from ZIP",
                  )}
                </Text>
              </div>
              <NumberInput
                value={fileLimitInput}
                onChange={setFileLimitInput}
                onBlur={() => {
                  const numValue = Number(fileLimitInput);
                  const finalValue =
                    !fileLimitInput ||
                    isNaN(numValue) ||
                    numValue < 1 ||
                    numValue > 100
                      ? DEFAULT_AUTO_UNZIP_FILE_LIMIT
                      : numValue;
                  setFileLimitInput(finalValue);
                  updatePreference("autoUnzipFileLimit", finalValue);
                }}
                min={1}
                max={100}
                step={1}
                disabled={!preferences.autoUnzip}
                style={{ width: 90 }}
              />
            </div>
          </Tooltip>
        </Stack>
      </Paper>

      {/* Update Modal */}
      {updateSummary && (config?.appVersion || !!desktopInstall) && (
        <UpdateModal
          opened={updateModalOpened}
          onClose={() => setUpdateModalOpened(false)}
          onRemindLater={() => {
            localStorage.setItem(
              "stirling-pdf-updater:snoozedUntil",
              String(Date.now() + 24 * 60 * 60 * 1000),
            );
          }}
          currentVersion={appVersion ?? config?.appVersion ?? ""}
          updateSummary={updateSummary}
          machineInfo={{
            machineType: config?.machineType ?? "unknown",
            activeSecurity: config?.activeSecurity ?? false,
            licenseType: config?.license ?? "NORMAL",
          }}
          desktopInstall={desktopInstallProps}
        />
      )}
    </Stack>
  );
};

export default GeneralSection;
