import { useMemo } from "react";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import { useTranslation } from "react-i18next";
import {
  TextInput,
  Switch,
  Stack,
  Paper,
  Text,
  Group,
  MultiSelect,
  Select,
} from "@mantine/core";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import { usePreferences } from "@app/contexts/PreferencesContext";
import {
  supportedLanguages,
  toUnderscoreFormat,
  toUnderscoreLanguages,
} from "@app/i18n";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";
import type { GeneralCardProps } from "@app/components/shared/config/configSections/server/serverCardProps";

/** Branding, languages and the system-wide toggles. Writes ui.* and system.*. */
export function SystemCard({
  settings,
  setSettings,
  isFieldPending,
  loginEnabled,
}: GeneralCardProps) {
  const { t } = useTranslation();
  const { preferences, updatePreference } = usePreferences();

  const languageOptions = useMemo(
    () =>
      Object.entries(supportedLanguages)
        .map(([code, label]) => ({
          value: toUnderscoreFormat(code),
          label: `${label} (${code})`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [],
  );

  const selectedLanguages = useMemo(
    () => toUnderscoreLanguages(settings.ui?.languages || []),
    [settings.ui?.languages],
  );

  // Filter default locale options based on available languages setting
  const defaultLocaleOptions = useMemo(() => {
    // If no languages are selected (empty), show all languages
    if (!selectedLanguages || selectedLanguages.length === 0) {
      return languageOptions;
    }
    // Otherwise, only show languages that are in the selected list
    return languageOptions.filter((option) =>
      selectedLanguages.includes(option.value),
    );
  }, [selectedLanguages, languageOptions]);

  // Show the server setting when loaded (for admin config), otherwise show user's preference
  // Note: User's preference in localStorage is separate and takes precedence in the app via useLogoVariant hook
  const logoStyleValue = loginEnabled
    ? (settings.ui?.logoStyle ?? preferences.logoVariant ?? "modern")
    : (preferences.logoVariant ?? "modern");

  const handleLogoStyleChange = (value: string) => {
    const nextValue = value === "classic" ? "classic" : "modern";

    // Only update local settings state - don't update the actual preference until save
    // When login is disabled, update preference immediately since there's no server to save to
    if (!loginEnabled) {
      updatePreference("logoVariant", nextValue);
      return;
    }

    setSettings({
      ...settings,
      ui: {
        ...settings.ui,
        logoStyle: nextValue,
      },
    });
  };

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <div>
          <TextInput
            label={
              <Group gap="xs">
                <span>
                  {t(
                    "admin.settings.general.appNameNavbar.label",
                    "Navbar Brand",
                  )}
                </span>
                <PendingBadge show={isFieldPending("ui.appNameNavbar")} />
                <InfoTooltip
                  label={t(
                    "admin.settings.general.appNameNavbar.description",
                    "The name displayed in the navigation bar",
                  )}
                />
              </Group>
            }
            value={settings.ui?.appNameNavbar || ""}
            onChange={(e) =>
              setSettings({
                ...settings,
                ui: { ...settings.ui, appNameNavbar: e.target.value },
              })
            }
            placeholder="Stirling PDF"
            disabled={!loginEnabled}
          />
        </div>

        <div>
          <Text component="div" size="sm" fw={500} mb={4}>
            <Group gap="xs">
              <span>
                {t("admin.settings.general.logoStyle.label", "Logo Style")}
              </span>
              <PendingBadge show={isFieldPending("ui.logoStyle")} />
              <InfoTooltip
                label={t(
                  "admin.settings.general.logoStyle.description",
                  "Choose between the modern minimalist logo or the classic S icon",
                )}
              />
            </Group>
          </Text>
          <SegmentedControl
            value={logoStyleValue}
            onChange={handleLogoStyleChange}
            options={[
              {
                value: "classic",
                label: (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.25rem 0",
                    }}
                  >
                    <img
                      src="classic-logo/favicon.ico"
                      alt={t(
                        "admin.settings.general.logoStyle.classicAlt",
                        "Classic logo",
                      )}
                      style={{ width: "24px", height: "24px" }}
                    />
                    <span>
                      {t("admin.settings.general.logoStyle.classic", "Classic")}
                    </span>
                  </div>
                ),
              },
              {
                value: "modern",
                label: (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.25rem 0",
                    }}
                  >
                    <img
                      src="modern-logo/StirlingPDFLogoNoTextLight.svg"
                      alt={t(
                        "admin.settings.general.logoStyle.modernAlt",
                        "Modern logo",
                      )}
                      style={{ width: "24px", height: "24px" }}
                    />
                    <span>
                      {t("admin.settings.general.logoStyle.modern", "Modern")}
                    </span>
                  </div>
                ),
              },
            ]}
          />
        </div>

        <div>
          <MultiSelect
            label={
              <Group gap="xs">
                <span>
                  {t(
                    "admin.settings.general.languages.label",
                    "Available Languages",
                  )}
                </span>
                <PendingBadge show={isFieldPending("ui.languages")} />
                <InfoTooltip
                  label={t(
                    "admin.settings.general.languages.description",
                    "Limit which languages are available (empty = all languages)",
                  )}
                />
              </Group>
            }
            value={selectedLanguages}
            onChange={(value) =>
              setSettings({
                ...settings,
                ui: { ...settings.ui, languages: value },
              })
            }
            data={languageOptions}
            searchable
            clearable
            placeholder={t(
              "admin.settings.general.languages.placeholder",
              "Select languages",
            )}
            comboboxProps={{
              withinPortal: true,
              zIndex: Z_INDEX_OVER_CONFIG_MODAL,
            }}
            disabled={!loginEnabled}
          />
        </div>

        <div>
          <Select
            label={
              <Group gap="xs">
                <span>
                  {t(
                    "admin.settings.general.defaultLocale.label",
                    "Default Locale",
                  )}
                </span>
                <PendingBadge show={isFieldPending("system.defaultLocale")} />
                <InfoTooltip
                  label={t(
                    "admin.settings.general.defaultLocale.description",
                    "The default language for new users (e.g., en_US, es_ES)",
                  )}
                />
              </Group>
            }
            value={settings.system?.defaultLocale || ""}
            onChange={(value) =>
              setSettings({
                ...settings,
                system: { ...settings.system, defaultLocale: value || "" },
              })
            }
            data={defaultLocaleOptions}
            searchable
            clearable
            placeholder="en_US"
            comboboxProps={{
              withinPortal: true,
              zIndex: Z_INDEX_OVER_CONFIG_MODAL,
            }}
            disabled={!loginEnabled}
          />
        </div>

        <div>
          <TextInput
            label={
              <Group gap="xs">
                <span>
                  {t(
                    "admin.settings.general.fileUploadLimit.label",
                    "File Upload Limit",
                  )}
                </span>
                <PendingBadge show={isFieldPending("system.fileUploadLimit")} />
                <InfoTooltip
                  label={t(
                    "admin.settings.general.fileUploadLimit.description",
                    "Maximum file upload size (e.g., 100MB, 1GB)",
                  )}
                />
              </Group>
            }
            value={settings.system?.fileUploadLimit || ""}
            onChange={(e) =>
              setSettings({
                ...settings,
                system: {
                  ...settings.system,
                  fileUploadLimit: e.target.value,
                },
              })
            }
            placeholder="100MB"
            disabled={!loginEnabled}
          />
        </div>

        <div id="frontendUrl">
          <TextInput
            label={
              <Group gap="xs">
                <span>
                  {t(
                    "admin.settings.general.frontendUrl.label",
                    "Frontend URL",
                  )}
                </span>
                <PendingBadge show={isFieldPending("system.frontendUrl")} />
                <InfoTooltip
                  label={t(
                    "admin.settings.general.frontendUrl.description",
                    "Base URL for frontend (e.g., https://pdf.example.com). Used for email invite links and mobile QR code uploads. Leave empty to use backend URL.",
                  )}
                />
              </Group>
            }
            value={settings.system?.frontendUrl || ""}
            onChange={(e) =>
              setSettings({
                ...settings,
                system: { ...settings.system, frontendUrl: e.target.value },
              })
            }
            placeholder="https://pdf.example.com"
            disabled={!loginEnabled}
          />
        </div>

        {/* Hide Disabled Tools Settings */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "1rem",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text fw={500} size="sm">
              {t(
                "admin.settings.general.hideDisabledTools.googleDrive.label",
                "Hide Google Drive",
              )}{" "}
              <InfoTooltip
                label={t(
                  "admin.settings.general.hideDisabledTools.googleDrive.description",
                  "Hide Google Drive button when not enabled",
                )}
              />
            </Text>
          </div>
          <Group gap="xs">
            <Switch
              checked={settings.ui?.hideDisabledTools?.googleDrive || false}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  ui: {
                    ...settings.ui,
                    hideDisabledTools: {
                      ...settings.ui?.hideDisabledTools,
                      googleDrive: e.target.checked,
                    },
                  },
                })
              }
              disabled={!loginEnabled}
            />
            <PendingBadge
              show={isFieldPending("ui.hideDisabledTools.googleDrive")}
            />
          </Group>
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
                "admin.settings.general.hideDisabledTools.mobileScanner.label",
                "Hide Mobile Scanner",
              )}{" "}
              <InfoTooltip
                label={t(
                  "admin.settings.general.hideDisabledTools.mobileScanner.description",
                  "Hide mobile QR scanner button when not enabled",
                )}
              />
            </Text>
          </div>
          <Group gap="xs">
            <Switch
              checked={settings.ui?.hideDisabledTools?.mobileQRScanner || false}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  ui: {
                    ...settings.ui,
                    hideDisabledTools: {
                      ...settings.ui?.hideDisabledTools,
                      mobileQRScanner: e.target.checked,
                    },
                  },
                })
              }
              disabled={!loginEnabled}
            />
            <PendingBadge
              show={isFieldPending("ui.hideDisabledTools.mobileQRScanner")}
            />
          </Group>
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
                "admin.settings.general.showUpdate.label",
                "Show Update Notifications",
              )}{" "}
              <InfoTooltip
                label={t(
                  "admin.settings.general.showUpdate.description",
                  "Display notifications when a new version is available",
                )}
              />
            </Text>
          </div>
          <Group gap="xs">
            <Switch
              checked={settings.system?.showUpdate || false}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  system: {
                    ...settings.system,
                    showUpdate: e.target.checked,
                  },
                })
              }
              disabled={!loginEnabled}
            />
            <PendingBadge show={isFieldPending("system.showUpdate")} />
          </Group>
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
                "admin.settings.general.showUpdateOnlyAdmin.label",
                "Show Updates to Admins Only",
              )}{" "}
              <InfoTooltip
                label={t(
                  "admin.settings.general.showUpdateOnlyAdmin.description",
                  "Restrict update notifications to admin users only",
                )}
              />
            </Text>
          </div>
          <Group gap="xs">
            <Switch
              checked={settings.system?.showUpdateOnlyAdmin || false}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  system: {
                    ...settings.system,
                    showUpdateOnlyAdmin: e.target.checked,
                  },
                })
              }
              disabled={!loginEnabled}
            />
            <PendingBadge show={isFieldPending("system.showUpdateOnlyAdmin")} />
          </Group>
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
                "admin.settings.general.customHTMLFiles.label",
                "Custom HTML Files",
              )}{" "}
              <InfoTooltip
                label={t(
                  "admin.settings.general.customHTMLFiles.description",
                  "Allow serving custom HTML files from the customFiles directory",
                )}
              />
            </Text>
          </div>
          <Group gap="xs">
            <Switch
              checked={settings.system?.customHTMLFiles || false}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  system: {
                    ...settings.system,
                    customHTMLFiles: e.target.checked,
                  },
                })
              }
              disabled={!loginEnabled}
            />
            <PendingBadge show={isFieldPending("system.customHTMLFiles")} />
          </Group>
        </div>
      </Stack>
    </Paper>
  );
}
