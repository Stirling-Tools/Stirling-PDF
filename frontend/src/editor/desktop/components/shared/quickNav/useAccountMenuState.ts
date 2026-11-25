import { useTranslation } from "react-i18next";
import { useAuth } from "@editor/auth/UseSession";
import { OPEN_SIGN_IN_EVENT } from "@editor/constants/signInEvents";
import { useConnectionMode } from "@editor/hooks/useConnectionMode";
import type { AccountMenuState } from "@editor-core/components/shared/quickNav/useAccountMenuState";

export type { AccountMenuState };

export function useAccountMenuState(): AccountMenuState {
  const { t } = useTranslation();
  const mode = useConnectionMode();
  const { user, isAnonymous, loading } = useAuth();
  const signedIn = Boolean(user) && !isAnonymous;

  if (mode === null || (mode !== "local" && (loading || signedIn))) {
    return { actions: [] };
  }
  return {
    header: mode === "local" ? "local" : "signedOut",
    actions: [
      {
        id: "sign-in",
        label: t("quickNav.accountMenu.signIn", "Sign in"),
        icon: "log-in",
        onSelect: () =>
          window.dispatchEvent(new CustomEvent(OPEN_SIGN_IN_EVENT)),
      },
    ],
  };
}
