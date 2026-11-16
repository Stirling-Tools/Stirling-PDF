import { useTranslation } from "react-i18next";

export function AppVersionLabel() {
  const { t } = useTranslation();
  return t("settings.general.versionInfo.desktop", "Desktop Version");
}

export function BackendVersionLabel() {
  const { t } = useTranslation();
  return t("settings.general.versionInfo.server", "Server Version");
}

export function VersionMismatchMessage() {
  const { t } = useTranslation();
  return t(
    "settings.general.updates.versionMismatch",
    "Your desktop application and server are running different versions. Update both to the same version to avoid compatibility issues.",
  );
}
