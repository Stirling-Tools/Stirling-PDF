import { useTranslation } from "react-i18next";
import { useAuth } from "@app/auth/UseSession";
import { usePortalAccessState } from "@app/hooks/usePortalAccess";
import { HAS_PORTAL } from "@app/routes/hasPortal";
import type { QuickNavAccountShortcut } from "@app/contexts/QuickNavHostContext";

/** SaaS: account, users and billing, which a guest has none of. */
export function useAccountMenuShortcuts(): QuickNavAccountShortcut[] {
  const { t } = useTranslation();
  const { user, isAnonymous } = useAuth();
  // Not from useAuth: the Supabase session carries no permission flags.
  const { granted: portalAccess } = usePortalAccessState();

  if (!user || isAnonymous) {
    return [
      {
        id: "preferences",
        label: t("settings.preferences.title", "Preferences"),
        icon: "sliders-horizontal",
        to: "/settings/general",
      },
    ];
  }

  return [
    {
      id: "account",
      label: t("quickNav.account", "Account"),
      icon: "circle-user",
      to: "/settings/overview",
    },
    {
      id: "users",
      label: t("portal.nav.users", "Users"),
      icon: "users",
      to: "/settings/users",
    },
    // Usage & Billing replaces Plan in settings for processor members.
    HAS_PORTAL && portalAccess
      ? {
          id: "billing",
          label: t("portal.nav.usage", "Usage & Billing"),
          icon: "credit-card",
          to: "/settings/billing",
        }
      : {
          id: "plan",
          label: t("config.plan", "Plan"),
          icon: "credit-card",
          to: "/settings/plan",
        },
    {
      id: "api-keys",
      label: t("settings.developer.apiKeys", "API Keys"),
      icon: "key",
      to: "/settings/api-keys",
    },
  ];
}
