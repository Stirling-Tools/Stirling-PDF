import { useTranslation } from "react-i18next";
import { useAuth } from "@editor/auth/UseSession";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import { HAS_PORTAL } from "@editor/routes/hasPortal";
import { usePortalAccessState } from "@editor/hooks/usePortalAccess";
import { useRosterAvailable } from "@editor/hooks/useRosterAvailable";
import type { QuickNavAccountShortcut } from "@editor/contexts/QuickNavHostContext";

/** Interpolated, not inlined: a literal "#acc…" reads as a hex colour to theme-lint. */
const ACCOUNT_ANCHOR = "account";

/**
 * Self-hosted: your own account first, then the server pages admins live in.
 * With login off there is no account and every admin page is disabled, so the
 * menu offers only what that visitor can actually use.
 */
export function useAccountMenuShortcuts(): QuickNavAccountShortcut[] {
  const { t } = useTranslation();
  const { user, isAnonymous, isAdmin: sessionAdmin, loading } = useAuth();
  const { config } = useAppConfig();
  const { granted: portalAccess, settled: accessSettled } =
    usePortalAccessState();
  const rosterAvailable = useRosterAvailable();
  const signedIn = Boolean(user) && !isAnonymous;

  if (!signedIn) {
    return [
      {
        id: "preferences",
        label: t("settings.preferences.title", "Preferences"),
        icon: "sliders-horizontal",
        to: "/settings/general",
      },
      {
        id: "about",
        label: t("settings.about.title", "About"),
        icon: "circle-question-mark",
        to: "/settings/about",
      },
    ];
  }

  // The settings nav gates admin pages on this flag, not the session's.
  const isAdmin = config?.isAdmin ?? false;
  const shortcuts: QuickNavAccountShortcut[] = [
    {
      id: "account",
      label: t("quickNav.account", "Account"),
      icon: "circle-user",
      to: `/settings/general#${ACCOUNT_ANCHOR}`,
    },
  ];

  if (
    rosterAvailable &&
    config?.enableLogin === true &&
    sessionAdmin &&
    !loading
  ) {
    shortcuts.push({
      id: "users",
      label: t("portal.nav.users", "Users"),
      icon: "users",
      to: "/settings/users",
    });
  }
  if (isAdmin) {
    // In place of API Keys, keeping the menu short.
    shortcuts.push({
      id: "server",
      label: t("quickNav.accountMenu.server", "Server settings"),
      icon: "server",
      to: "/settings/adminGeneral",
    });
    if (
      HAS_PORTAL &&
      portalAccess &&
      accessSettled &&
      sessionAdmin &&
      !loading &&
      user?.orgOwner === true
    ) {
      shortcuts.push({
        id: "billing",
        label: t("portal.nav.usage", "Usage & Billing"),
        icon: "credit-card",
        to: "/settings/billing",
      });
    }
  } else {
    shortcuts.push({
      id: "api-keys",
      label: t("settings.developer.apiKeys", "API Keys"),
      icon: "key",
      to: "/settings/api-keys",
    });
  }
  return shortcuts;
}
