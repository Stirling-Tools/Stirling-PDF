import { useTranslation } from "react-i18next";
import type { LocalModePresentation } from "@editor-tauri/hooks/useLocalModePresentation";

export type { LocalModePresentation };

/** A phone has no local tools, so "local" is just the signed-out state. */
export function useLocalModePresentation(): LocalModePresentation {
  const { t } = useTranslation();
  return {
    label: t("mobile.account.notConnected", "Not connected"),
    description: t(
      "mobile.account.signedOutBody",
      "Sign in to run tools on Stirling Cloud or your own server.",
    ),
    offersLocalTools: false,
  };
}
