import { useTranslation } from "react-i18next";
import { useConnectionMode } from "@editor/hooks/useConnectionMode";
import { executionTargetFor } from "@editor/services/operationRouter";

/** Desktop shadow: fonts from the bundled backend ship with the app, so only a remote backend is named a server. */
export function useServerFontsGroupLabel(): string {
  const { t } = useTranslation();
  const mode = useConnectionMode();
  return mode && executionTargetFor(mode) === "remote"
    ? t("pdfTextEditor.fontPicker.serverGroup", "Server fonts")
    : t("pdfTextEditor.fontPicker.includedGroup", "Included fonts");
}
