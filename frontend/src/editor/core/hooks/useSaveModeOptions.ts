import { useTranslation } from "react-i18next";
import type { SaveMode } from "@editor/services/saveMode";

export function useSaveModeOptions(): { value: SaveMode; label: string }[] {
  const { t } = useTranslation();
  return [
    {
      value: "replace",
      label: t("saveFile.mode.replace", "Update the original"),
    },
    { value: "copy", label: t("saveFile.mode.copy", "Save a copy next to it") },
    { value: "ask", label: t("saveFile.mode.ask", "Ask each time") },
  ];
}
