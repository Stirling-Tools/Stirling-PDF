import { useTranslation } from "react-i18next";
import type { StartupView } from "@app/services/preferencesService";

export interface StartupViewOption {
  label: string;
  value: StartupView;
}

/** The choices for "Default view on launch". A seam: desktop adds the Processor. */
export function useStartupViewOptions(): StartupViewOption[] {
  const { t } = useTranslation();
  return [
    { label: t("settings.general.startupView.tools", "Tools"), value: "tools" },
    { label: t("settings.general.startupView.read", "Reader"), value: "read" },
    {
      label: t("settings.general.startupView.automate", "Automate"),
      value: "automate",
    },
  ];
}
