import { useState } from "react";
import { useTranslation } from "react-i18next";
import { alert } from "@app/components/toast";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import apiClient from "@app/services/apiClient";

export function useRestartServer() {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const [restartModalOpened, setRestartModalOpened] = useState(false);

  // Only deployments running from a packaged JAR with the restart helper can self-restart.
  // Hosted/containerised deployments (and dev runs) can't, so offering a "Restart Now" action
  // there always fails. Treat an unknown value as restartable to preserve existing behaviour.
  const restartSupported = config?.restartSupported !== false;

  const showRestartModal = () => {
    if (!restartSupported) {
      // No self-restart available here — give accurate guidance instead of a failing action.
      alert({
        alertType: "neutral",
        title: t("admin.settings.saved", "Settings saved successfully"),
        body: t(
          "admin.settings.restartNotSupported",
          "Your changes have been saved. Some settings only take effect after the server is restarted.",
        ),
      });
      return;
    }
    setRestartModalOpened(true);
  };

  const closeRestartModal = () => {
    setRestartModalOpened(false);
  };

  const restartServer = async () => {
    setRestartModalOpened(false);

    await apiClient
      .post("/api/v1/admin/settings/restart", undefined, {
        suppressErrorToast: true,
      })
      .then(() => {
        alert({
          alertType: "neutral",
          title: t("admin.settings.restarting", "Restarting Server"),
          body: t(
            "admin.settings.restartingMessage",
            "The server is restarting. Please wait a moment...",
          ),
        });
        // Wait a moment then reload the page
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      })
      .catch(async (_error) => {
        alert({
          alertType: "error",
          title: t("admin.error", "Error"),
          body: t(
            "admin.settings.restartError",
            "Failed to restart server. Please restart manually.",
          ),
        });
      });
  };

  return {
    restartModalOpened,
    showRestartModal,
    closeRestartModal,
    restartServer,
  };
}
