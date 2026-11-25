import type { TFunction } from "i18next";
import type { QuickNavAccountShortcut } from "@editor/contexts/QuickNavHostContext";

export function preferenceShortcuts(
  t: TFunction<"translation", undefined>,
): QuickNavAccountShortcut[] {
  return [
    {
      id: "appearance",
      label: t("settings.preferences.appearance", "Appearance"),
      icon: "palette",
      to: "/settings/general#appearance",
    },
    {
      id: "hotkeys",
      label: t("settings.hotkeys.title", "Keyboard Shortcuts"),
      icon: "keyboard",
      to: "/settings/general#hotkeys",
    },
  ];
}
