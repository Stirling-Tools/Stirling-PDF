import { useTranslation } from "react-i18next";

export function AppVersionLabel() {
  const { t } = useTranslation();
  return t(
    "settings.general.updates.currentFrontendVersion",
    "Current Frontend Version",
  );
}

export function BackendVersionLabel() {
  const { t } = useTranslation();
  return t(
    "settings.general.updates.currentBackendVersion",
    "Current Backend Version",
  );
}

export function VersionMismatchMessage() {
  const { t } = useTranslation();
  return t(
    "settings.general.updates.versionMismatch",
    "Your application and server are running different versions. Update both to the same version to avoid compatibility issues.",
  );
}
