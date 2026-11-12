import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { connectionModeService } from "@editor/services/connectionModeService";

/**
 * Desktop shadow: only a self-hosted connection has a server the user set up.
 * Otherwise these fonts are the set that ships with the app, so calling them
 * "Server fonts" would name something the user never sees.
 */
export function useServerFontsGroupLabel(): string {
  const { t } = useTranslation();
  const [selfHosted, setSelfHosted] = useState(
    () => connectionModeService.getCachedMode() === "selfhosted",
  );

  useEffect(() => {
    let current = true;
    void connectionModeService.getCurrentMode().then((mode) => {
      if (current) setSelfHosted(mode === "selfhosted");
    });
    const unsubscribe = connectionModeService.subscribeToModeChanges(
      (config) => {
        current = false;
        setSelfHosted(config.mode === "selfhosted");
      },
    );
    return () => {
      current = false;
      unsubscribe();
    };
  }, []);

  return selfHosted
    ? t("pdfTextEditor.fontPicker.serverGroup", "Server fonts")
    : t("pdfTextEditor.fontPicker.includedGroup", "Included fonts");
}
