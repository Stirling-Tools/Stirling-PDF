import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SettingsCard } from "@app/components/shared/config/SettingsCard";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { AdminSetupBanner } from "@app/components/shared/config/configSections/preferences/AdminSetupBanner";
import { AppearanceCard } from "@app/components/shared/config/configSections/preferences/AppearanceCard";
import { EditorDefaultsCard } from "@app/components/shared/config/configSections/preferences/EditorDefaultsCard";
import { DownloadsCard } from "@app/components/shared/config/configSections/preferences/DownloadsCard";
import { SoftwareUpdatesCard } from "@app/components/shared/config/configSections/preferences/SoftwareUpdatesCard";
import { HotkeysCard } from "@app/components/shared/config/configSections/preferences/HotkeysCard";
import type {
  DesktopInstall,
  DesktopUpdateModeControl,
} from "@app/components/shared/config/configSections/preferences/preferencesCardProps";
import "@app/components/shared/config/configSections/preferences/PreferencesSection.css";

export interface PreferencesSectionProps {
  /** SaaS: login is always on, so the "turn login on" banner never applies. */
  hideAdminBanner?: boolean;
  /** SaaS build and managed-disabled desktop: no update UI, and no update call. */
  hideUpdateSection?: boolean;
  desktopInstall?: DesktopInstall;
  desktopUpdateMode?: DesktopUpdateModeControl;
  /**
   * The Account and Two-factor cards. Core has no accounts, so the flavors that
   * do pass them in (AccountCards) rather than core reaching into proprietary.
   * The slot supplies its own `<section>` wrappers and anchors.
   */
  accountSlot?: ReactNode;
  /** Extra rows under Editor defaults: login landing, desktop file defaults. */
  editorDefaultsSlot?: ReactNode;
}

/** True when the URL deep-links at the shortcuts card, which starts collapsed. */
function focusIsHotkeys(): boolean {
  const focus =
    new URLSearchParams(window.location.search).get("focus") ||
    window.location.hash.replace(/^#/, "");
  return focus === "hotkeys" || Boolean(focus?.startsWith("setting-hotkeys"));
}

/**
 * Everything you set for yourself, previously three nav rows (General, Keyboard
 * Shortcuts and Account). None of them saves through the admin API, so this page
 * has no draft and no save footer: every control writes as you touch it.
 *
 * The old General row was one unlabelled card of unrelated controls; it is split
 * into Appearance, Editor defaults, Downloads and Software updates so each can
 * be linked to. Shortcuts stays last and collapsed: it renders a row per
 * registered tool and would otherwise bury everything above it.
 */
export default function PreferencesSection({
  hideAdminBanner = false,
  hideUpdateSection = false,
  desktopInstall,
  desktopUpdateMode,
  accountSlot,
  editorDefaultsSlot,
}: PreferencesSectionProps) {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const startHotkeysOpen = focusIsHotkeys();

  // Same condition the standalone section used: a version to report, or the
  // desktop updater. Not mounting the card is what skips the update check.
  const showUpdates =
    !hideUpdateSection && Boolean(config?.appVersion || desktopInstall);

  return (
    <div className="settings-section-container">
      <div className="preferences-section">
        {!hideAdminBanner && <AdminSetupBanner />}

        {accountSlot}

        <SettingsCard
          id="appearance"
          title={t("settings.preferences.appearance", "Appearance")}
        >
          <AppearanceCard />
        </SettingsCard>

        <SettingsCard
          id="editorDefaults"
          title={t("settings.preferences.editorDefaults", "Editor defaults")}
        >
          <EditorDefaultsCard />
          {editorDefaultsSlot}
        </SettingsCard>

        <SettingsCard
          id="downloads"
          title={t("settings.preferences.downloads", "Downloads")}
        >
          <DownloadsCard />
        </SettingsCard>

        {showUpdates && (
          <SettingsCard
            id="softwareUpdates"
            title={t("settings.general.updates.title", "Software Updates")}
          >
            <SoftwareUpdatesCard
              desktopInstall={desktopInstall}
              desktopUpdateMode={desktopUpdateMode}
            />
          </SettingsCard>
        )}

        <SettingsCard
          id="hotkeys"
          title={t("settings.hotkeys.title", "Keyboard Shortcuts")}
          description={t(
            "settings.hotkeys.description",
            'Customize keyboard shortcuts for quick tool access. Click "Change shortcut" and press a new key combination. Press Esc to cancel.',
          )}
          // A row per registered tool, so it stays shut and unmounted until asked for.
          defaultCollapsed={!startHotkeysOpen}
          lazy
        >
          <HotkeysCard />
        </SettingsCard>
      </div>
    </div>
  );
}
