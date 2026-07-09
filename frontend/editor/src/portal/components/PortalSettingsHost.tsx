import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import AppConfigModalLazy from "@app/components/shared/AppConfigModalLazy";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import { ThemeProvider } from "@app/components/shared/ThemeProvider";
import { AuthProvider } from "@app/auth/UseSession";
import {
  VALID_NAV_KEYS,
  type ConfigNavSection,
  type NavKey,
} from "@app/components/shared/config/types";
import { accountLinkSettings } from "@portal/components/settings/accountLinkSettings";
import { useUI } from "@portal/contexts/UIContext";

/**
 * Mounts the editor's settings modal (the app-wide settings surface) inside the
 * portal. The portal deliberately lives outside the editor's AppProviders, so
 * this host supplies the contexts the settings tree needs: app config, user
 * preferences, the session provider the account sections read (flavor-resolved:
 * Spring on self-hosted, Supabase on SaaS — same underlying session the portal
 * is already signed in with), and the editor ThemeProvider (which also carries
 * the Mantine theme + toasts the sections expect). URL sync is off — the portal
 * owns its /portal/* routes, so the modal keeps its section purely in state.
 *
 * Everything (providers included) mounts on first open and stays mounted, so
 * the editor theme wiring never runs for portal sessions that never open
 * settings.
 */
export function PortalSettingsHost() {
  const { settingsOpen, settingsInitialSection, closeSettings } = useUI();
  const { t } = useTranslation();
  const [everOpened, setEverOpened] = useState(false);

  useEffect(() => {
    if (settingsOpen) setEverOpened(true);
  }, [settingsOpen]);

  // Portal-only sections, appended after the build's registry sections. The
  // account-link seam is self-hosted-only (the saas overlay shadows it to null).
  const extraSections = useMemo<ConfigNavSection[]>(() => {
    if (!accountLinkSettings) return [];
    const { navKey, labelKey, icon, Body } = accountLinkSettings;
    return [
      {
        title: t("portal.settings.groups.admin", "Admin"),
        items: [
          {
            key: navKey,
            label: t(labelKey, "Account link"),
            icon,
            component: <Body />,
          },
        ],
      },
    ];
  }, [t]);

  const initialSection: NavKey | null =
    settingsInitialSection &&
    (VALID_NAV_KEYS as readonly string[]).includes(settingsInitialSection)
      ? (settingsInitialSection as NavKey)
      : null;

  if (!everOpened) return null;

  return (
    <AppConfigProvider bootstrapMode="non-blocking">
      <AuthProvider>
        <PreferencesProvider>
          <ThemeProvider>
            <AppConfigModalLazy
              opened={settingsOpen}
              onClose={closeSettings}
              urlSync={false}
              initialSection={initialSection}
              extraSections={extraSections}
            />
          </ThemeProvider>
        </PreferencesProvider>
      </AuthProvider>
    </AppConfigProvider>
  );
}
