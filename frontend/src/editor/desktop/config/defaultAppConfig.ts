import type { AppConfig } from "@editor/types/appConfig";

/**
 * Default configuration used while the bundled backend starts up.
 */
export const DESKTOP_DEFAULT_APP_CONFIG: AppConfig = {
  enableLogin: false,
  premiumEnabled: false,
  runningProOrHigher: false,
};
