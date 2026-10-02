import { useTranslation } from "react-i18next";
import { usePreferences } from "@app/contexts/PreferencesContext";
import { usePortalAccess } from "@app/hooks/usePortalAccess";
import {
  useStartupViewOptions as useCoreStartupViewOptions,
  type StartupViewOption,
} from "@core/components/shared/config/configSections/preferences/useStartupViewOptions";

export type { StartupViewOption };

/** Desktop offers the Processor with access, and keeps showing a choice already made. */
export function useStartupViewOptions(): StartupViewOption[] {
  const { t } = useTranslation();
  const options = useCoreStartupViewOptions();
  const access = usePortalAccess();
  const { preferences } = usePreferences();
  if (!access && preferences.defaultStartupView !== "processor") return options;
  return [
    ...options,
    {
      label: t("settings.general.startupView.processor", "Processor"),
      value: "processor",
    },
  ];
}
