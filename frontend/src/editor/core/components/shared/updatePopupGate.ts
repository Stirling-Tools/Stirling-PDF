import type { AppConfig } from "@app/types/appConfig";

export function isUpdatePopupAllowed(
  config: AppConfig | null,
  isMobile: boolean,
): boolean {
  if (!config) return false;
  if (isMobile) return false;
  return config.shouldShowUpdate === true;
}
