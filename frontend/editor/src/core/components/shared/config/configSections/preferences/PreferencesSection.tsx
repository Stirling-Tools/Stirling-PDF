import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import LocalIcon from "@app/components/shared/LocalIcon";
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
  const focus = new URLSearchParams(window.location.search).get("focus");
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
  const [hotkeysOpen, setHotkeysOpen] = useState(focusIsHotkeys);

  // Same condition the standalone section used: a version to report, or the
  // desktop updater. Not mounting the card is what skips the update check.
  const showUpdates =
    !hideUpdateSection && Boolean(config?.appVersion || desktopInstall);

  return (
    <div className="settings-section-container">
      <div className="preferences-section">
        {!hideAdminBanner && <AdminSetupBanner />}

        {accountSlot}

        <section className="preferences-section__card">
          <h2 className="preferences-section__heading" id="appearance">
            {t("settings.preferences.appearance", "Appearance")}
          </h2>
          <AppearanceCard />
        </section>

        <section className="preferences-section__card">
          <h2 className="preferences-section__heading" id="editorDefaults">
            {t("settings.preferences.editorDefaults", "Editor defaults")}
          </h2>
          <EditorDefaultsCard />
          {editorDefaultsSlot}
        </section>

        <section className="preferences-section__card">
          <h2 className="preferences-section__heading" id="downloads">
            {t("settings.preferences.downloads", "Downloads")}
          </h2>
          <DownloadsCard />
        </section>

        {showUpdates && (
          <section className="preferences-section__card">
            <h2 className="preferences-section__heading" id="softwareUpdates">
              {t("settings.general.updates.title", "Software Updates")}
            </h2>
            <SoftwareUpdatesCard
              desktopInstall={desktopInstall}
              desktopUpdateMode={desktopUpdateMode}
            />
          </section>
        )}

        <section className="preferences-section__card">
          <h2 className="preferences-section__heading" id="hotkeys">
            <button
              type="button"
              className="preferences-section__disclosure"
              aria-expanded={hotkeysOpen}
              aria-controls="preferences-hotkeys-panel"
              onClick={() => setHotkeysOpen((open) => !open)}
            >
              <LocalIcon
                icon="expand-more-rounded"
                width={16}
                height={16}
                className="preferences-section__disclosure-chevron"
              />
              {t("settings.hotkeys.title", "Keyboard Shortcuts")}
            </button>
          </h2>
          <div
            id="preferences-hotkeys-panel"
            className="preferences-section__panel"
            hidden={!hotkeysOpen}
          >
            {hotkeysOpen && <HotkeysCard />}
          </div>
        </section>
      </div>
    </div>
  );
}
