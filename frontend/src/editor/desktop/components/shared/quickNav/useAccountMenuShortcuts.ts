import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAccountMenuShortcuts as useServerAccountMenuShortcuts } from "@editor-proprietary/components/shared/quickNav/useAccountMenuShortcuts";
import { useAuth } from "@editor/auth/UseSession";
import { useConnectionMode } from "@editor/hooks/useConnectionMode";
import { authService } from "@editor/services/authService";
import { preferenceShortcuts } from "@editor/components/shared/quickNav/preferenceShortcuts";
import type { QuickNavAccountShortcut } from "@editor/contexts/QuickNavHostContext";

function useDesktopAuthenticated(): boolean {
  const [authenticated, setAuthenticated] = useState(false);
  useEffect(
    () =>
      authService.subscribeToAuth((status) =>
        setAuthenticated(status === "authenticated"),
      ),
    [],
  );
  return authenticated;
}

export function useAccountMenuShortcuts(): QuickNavAccountShortcut[] {
  const { t } = useTranslation();
  const serverShortcuts = useServerAccountMenuShortcuts();
  const mode = useConnectionMode();
  const desktopAuthenticated = useDesktopAuthenticated();
  const { user, isAnonymous, isAdmin, loading } = useAuth();
  const signedIn = Boolean(user) && !isAnonymous;

  const connection: QuickNavAccountShortcut = {
    id: "connection",
    label: t("settings.connection.title", "Connection Mode"),
    icon: "plug",
    to: "/settings/connectionMode",
  };
  const billing: QuickNavAccountShortcut = {
    id: "billing",
    label: t("portal.nav.usage", "Usage & Billing"),
    icon: "credit-card",
    to: "/settings/billing",
  };

  if (mode === null) return [];
  if (mode === "local" || !signedIn) {
    return [...preferenceShortcuts(t), connection];
  }
  if (mode === "saas") {
    if (!desktopAuthenticated) return [];
    return [
      {
        id: "users",
        label: t("portal.nav.users", "Users"),
        icon: "users",
        to: "/settings/users",
      },
      billing,
    ];
  }

  const isOwner = Boolean(isAdmin) && !loading && user?.orgOwner === true;
  if (
    !desktopAuthenticated ||
    !isOwner ||
    serverShortcuts.some((s) => s.id === "billing")
  ) {
    return serverShortcuts;
  }
  return [...serverShortcuts, billing];
}
