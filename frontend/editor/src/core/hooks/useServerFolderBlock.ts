import { useTranslation } from "react-i18next";
import { useAuth } from "@app/auth/UseSession";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useFolders } from "@app/contexts/FolderContext";

/** Why a server folder can't be created right now, or null when it can. */
export function useServerFolderBlock(): string | null {
  const { t } = useTranslation();
  const { isAnonymous } = useAuth();
  const { config: appConfig } = useAppConfig();
  const folders = useFolders();
  if (isAnonymous) {
    return t("filesPage.signInRequired", "Sign in to use cloud storage.");
  }
  // Two different problems, two different next steps: storage off is an
  // admin setting; unreachable is a connectivity state that fixes itself.
  if (appConfig?.storageEnabled !== true) {
    return t(
      "filesPage.newFolderStorageDisabled",
      "Server folder storage isn't enabled.",
    );
  }
  if (!folders.serverReachable) {
    return t("filesPage.syncError.network", "Could not reach the server.");
  }
  return null;
}
