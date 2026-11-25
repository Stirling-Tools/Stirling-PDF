import { useTranslation } from "react-i18next";
import { useAuth } from "@editor/auth/UseSession";
import { usePortalAccessState } from "@editor/hooks/usePortalAccess";
import { HAS_PORTAL } from "@editor/routes/hasPortal";
import { preferenceShortcuts } from "@editor/components/shared/quickNav/preferenceShortcuts";
import type { QuickNavAccountShortcut } from "@editor/contexts/QuickNavHostContext";

/** SaaS: users, keys and, once processor access is confirmed, Usage & Billing; a guest gets their own preferences. */
export function useAccountMenuShortcuts(): QuickNavAccountShortcut[] {
  const { t } = useTranslation();
  const { user, isAnonymous } = useAuth();
  // Not from useAuth: the Supabase session carries no permission flags.
  const { granted: portalAccess, settled: accessSettled } =
    usePortalAccessState();

  if (!user || isAnonymous) {
    return preferenceShortcuts(t);
  }

  const shortcuts: QuickNavAccountShortcut[] = [
    {
      id: "users",
      label: t("portal.nav.users", "Users"),
      icon: "users",
      to: "/settings/users",
    },
  ];
  if (HAS_PORTAL && portalAccess && accessSettled) {
    shortcuts.push({
      id: "billing",
      label: t("portal.nav.usage", "Usage & Billing"),
      icon: "credit-card",
      to: "/settings/billing",
    });
  }
  shortcuts.push({
    id: "api-keys",
    label: t("settings.developer.apiKeys", "API Keys"),
    icon: "key",
    to: "/settings/api-keys",
  });
  return shortcuts;
}
