import { AppConfig } from '@app/contexts/AppConfigContext';

/**
 * Default configuration used while the bundled backend starts up.
 * Mirrors the typical desktop defaults so the UI can render immediately.
 */
export const DESKTOP_DEFAULT_APP_CONFIG: AppConfig = {
  appNameNavbar: 'Stirling PDF',
  enableLogin: false,
  enableAnalytics: false,
  enablePosthog: false,
  enableScarf: false,
  premiumEnabled: false,
  runningEE: false,
  runningProOrHigher: false,
  languages: ['en'],
};
