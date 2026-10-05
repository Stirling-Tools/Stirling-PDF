import { useTranslation } from "react-i18next";
import type { QuickNavAccountShortcut } from "@app/contexts/QuickNavHostContext";

/**
 * The settings pages the avatar menu offers, for this build and this session.
 * A per-flavor seam: each build knows which sections it ships. A target the
 * session cannot see still lands safely, as the settings page falls back to
 * its first section.
 */
export function useAccountMenuShortcuts(): QuickNavAccountShortcut[] {
  const { t } = useTranslation();
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
