import React, { useState, useEffect } from "react";
import {
  Paper,
  Stack,
  Switch,
  Text,
  Tooltip,
  NumberInput,
  Select,
  Code,
  Group,
  Anchor,
  Badge,
  Popover,
} from "@mantine/core";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { ColorInput } from "@app/ui/ColorInput";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { clampAccentChoice } from "@app/utils/customPrimary";
import { useTranslation } from "react-i18next";
import { usePreferences } from "@app/contexts/PreferencesContext";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useTheme } from "@app/components/shared/ThemeProvider";
import LanguageSelector from "@app/components/shared/LanguageSelector";
import {
  THEME_ACCENT_PRESETS,
  DEFAULT_ACCENT,
  DEFAULT_ACCENT_COLOR,
  type ThemeMode,
} from "@app/constants/theme";
import type { ToolPanelMode } from "@app/constants/toolPanel";
import {
  DEFAULT_PREFERENCES,
  type StartupView,
  type ViewerZoomSetting,
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

/** Accent-colour picker: a swatch trigger opening a 3×5 grid — a "Default" icon cell + 14 accents — plus a "Custom" picker below. */
function AccentSwatchDropdown({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const isDefault = value === DEFAULT_ACCENT;
  // Resolve the "default" sentinel to the blue it maps to so the ColorInput shows a real colour.
  const asHex = (v: string) => (v === DEFAULT_ACCENT ? DEFAULT_ACCENT_COLOR : v);
  // Live picker value; committed to preferences only on drag-end (below).
  const [draft, setDraft] = useState(() => asHex(value));
  useEffect(() => setDraft(asHex(value)), [value]);
  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      withinPortal
      zIndex={Z_INDEX_OVER_CONFIG_MODAL}
      shadow="md"
      radius="md"
      withArrow
    >
      <Popover.Target>
        {/* eslint-disable-next-line no-restricted-syntax -- swatch-trigger control, not a text button; the shared Button's variants/padding don't fit */}
        <button
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          onClick={() => setOpened((o) => !o)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.25rem 0.5rem",
            borderRadius: "8px",
            border: "1px solid var(--c-border)",
            background: "var(--c-input-bg)",
            cursor: "pointer",
          }}
        >
          {isDefault ? (
            // Default is not a colour — show the icon chip so the trigger reads as unset, not a hue.
            <span
              style={{
                display: "grid",
                placeItems: "center",
                width: "1.25rem",
                height: "1.25rem",
                borderRadius: "5px",
                background: "var(--c-surface-raised)",
                boxShadow: "inset 0 0 0 1px var(--c-border)",
              }}
            >
              <LocalIcon
                icon="star-rounded"
                width="0.875rem"
                height="0.875rem"
                style={{ color: "var(--c-text-muted)" }}
              />
            </span>
          ) : (
            <span
              style={{
                width: "1.25rem",
                height: "1.25rem",
                borderRadius: "5px",
                background: value,
                boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.15)",
              }}
            />
          )}
          <LocalIcon
            icon="expand-more-rounded"
            width="1rem"
            height="1rem"
            style={{ color: "var(--c-text-subtle)" }}
          />
        </button>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <div
          role="radiogroup"
          aria-label={ariaLabel}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1.75rem)",
            gap: "0.6875rem",
            justifyContent: "center",
          }}
        >
          {/* Default — an icon chip for the neutral theme (surfaces untinted, blue buttons); stores the sentinel, a separate state from the colour swatches. */}
          {/* eslint-disable-next-line no-restricted-syntax -- an icon chip, not a text button; the shared Button's variants don't fit */}
          <button
            type="button"
            role="radio"
            aria-checked={isDefault}
            aria-label={t("settings.general.themeAccentDefault", "Default")}
            title={t(
              "settings.general.themeAccentDefaultHint",
              "Default theme (recommended)",
            )}
            onClick={() => {
              onChange(DEFAULT_ACCENT);
              setOpened(false);
            }}
            style={{
              display: "grid",
              placeItems: "center",
              width: "1.75rem",
              height: "1.75rem",
              padding: 0,
              borderRadius: "8px",
              cursor: "pointer",
              background: "var(--c-surface-raised)",
              border: "1px solid var(--c-border)",
              outline: isDefault ? "2px solid var(--c-text)" : "none",
              outlineOffset: "2px",
            }}
          >
            <LocalIcon
              icon="star-rounded"
              width="1.125rem"
              height="1.125rem"
              style={{ color: "var(--c-text-muted)" }}
            />
          </button>
          {THEME_ACCENT_PRESETS.map((color) => {
            const selected = value.toLowerCase() === color.toLowerCase();
            return (
              // eslint-disable-next-line no-restricted-syntax -- a colour swatch, not a text button; the shared Button's variants don't fit
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={color}
                onClick={() => {
                  onChange(color);
                  setOpened(false);
                }}
                style={{
                  width: "1.75rem",
                  height: "1.75rem",
                  padding: 0,
                  border: "none",
                  borderRadius: "8px",
                  background: color,
                  cursor: "pointer",
                  outline: selected ? "2px solid var(--c-text)" : "none",
                  outlineOffset: "2px",
                  boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.12)",
                }}
              />
            );
          })}
        </div>
        {/* Custom colour — below the presets; our ColorInput, clamped off white/grey/black. */}
        <div
          style={{
            marginTop: "0.5rem",
            paddingTop: "0.5rem",
            borderTop: "1px solid var(--c-border-subtle)",
          }}
        >
          <Text size="xs" c="dimmed" mb={6}>
            {t(
              "settings.general.themeAccentCustomHint",
              "Custom (defaults recommended)",
            )}
          </Text>
          <ColorInput
            inputSize="sm"
            format="hex"
            withPicker
            value={draft}
            onChange={setDraft}
            onChangeEnd={onChange}
            clampValue={clampAccentChoice}
            aria-label={t("settings.general.themeAccentCustom", "Custom colour")}
            popoverProps={{ withinPortal: false }}
          />
        </div>
      </Popover.Dropdown>
    </Popover>
  );
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
  const { setTheme, themeMode } = useTheme();
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

  // Check for updates on mount — skipped when the update UI is hidden (SaaS
  // build, managed-disabled desktop) so no external update call ever fires.
  useEffect(() => {
    if (hideUpdateSection) return;
    if (currentVersion) {
      checkForUpdate();
    }
  }, [currentVersion, config?.machineType, hideUpdateSection]);

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
            variant="tertiary"
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
                  variant="secondary"
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
                    accent={
                      updateSummary.max_priority === "urgent"
                        ? "danger"
                        : "default"
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
                  comboboxProps={{
                    withinPortal: true,
                    zIndex: Z_INDEX_OVER_CONFIG_MODAL,
                  }}
                />
              </Stack>
            )}
          </Stack>
        </Paper>
      )}

      {/* Appearance */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text fw={500} size="sm">
                {t("settings.general.theme", "Theme")}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t(
                  "settings.general.themeDescription",
                  "Choose light, dark, or follow your system so it switches automatically.",
                )}
              </Text>
            </div>
            <SegmentedControl
              value={themeMode}
              onChange={(val) => setTheme(val as ThemeMode)}
              options={[
                {
                  label: t("settings.general.themeLight", "Light"),
                  value: "light",
                },
                {
                  label: t("settings.general.themeDark", "Dark"),
                  value: "dark",
                },
                {
                  label: t("settings.general.themeSystem", "System"),
                  value: "system",
                },
              ]}
            />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "1rem",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text fw={500} size="sm">
                {t("settings.general.themeAccent", "Accent colour")}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t(
                  "settings.general.themeAccentDescription",
                  "Buttons, links and highlights follow it, and it subtly tints the app. Light and dark each have their own — System uses whichever is active.",
                )}
              </Text>
            </div>
            <Stack gap="md">
              <Group gap="sm" wrap="nowrap" align="flex-start" justify="flex-end">
                <Text size="sm" c="dimmed" style={{ width: "3rem", paddingTop: 4 }}>
                  {t("settings.general.themeLight", "Light")}
                </Text>
                <AccentSwatchDropdown
                  value={preferences.lightPrimary}
                  onChange={(val) => updatePreference("lightPrimary", val)}
                  ariaLabel={t(
                    "settings.general.themeAccentLight",
                    "Light mode accent colour",
                  )}
                />
              </Group>
              <Group gap="sm" wrap="nowrap" align="flex-start" justify="flex-end">
                <Text size="sm" c="dimmed" style={{ width: "3rem", paddingTop: 4 }}>
                  {t("settings.general.themeDark", "Dark")}
                </Text>
                <AccentSwatchDropdown
                  value={preferences.darkPrimary}
                  onChange={(val) => updatePreference("darkPrimary", val)}
                  ariaLabel={t(
                    "settings.general.themeAccentDark",
                    "Dark mode accent colour",
                  )}
                />
              </Group>
            </Stack>
          </div>
          <Group justify="flex-end">
            <Button
              variant="quiet"
              size="sm"
              onClick={() => {
                setTheme(DEFAULT_PREFERENCES.theme);
                updatePreference("lightPrimary", DEFAULT_PREFERENCES.lightPrimary);
                updatePreference("darkPrimary", DEFAULT_PREFERENCES.darkPrimary);
              }}
            >
              {t("settings.general.themeReset", "Restore theme to default")}
            </Button>
          </Group>
        </Stack>
      </Paper>

      {/* Language */}
      <Paper withBorder p="md" radius="md">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text fw={500} size="sm">
              {t("settings.general.language", "Language")}
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              {t(
                "settings.general.languageDescription",
                "Choose the display language",
              )}
            </Text>
          </div>
          <LanguageSelector position="bottom-end" offset={6} />
        </div>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
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
              options={[
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
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text fw={500} size="sm">
                {t(
                  "settings.general.defaultStartupView",
                  "Default view on launch",
                )}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t(
                  "settings.general.defaultStartupViewDescription",
                  "Choose which view is active when the app starts",
                )}
              </Text>
            </div>
            <SegmentedControl
              value={preferences.defaultStartupView}
              onChange={(val: string) =>
                updatePreference("defaultStartupView", val as StartupView)
              }
              options={[
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
            <div style={{ flex: 1, minWidth: 0 }}>
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
            <div style={{ flex: 1, minWidth: 0 }}>
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
            <div style={{ flex: 1, minWidth: 0 }}>
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
              <div style={{ flex: 1, minWidth: 0 }}>
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
              <div style={{ flex: 1, minWidth: 0 }}>
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
