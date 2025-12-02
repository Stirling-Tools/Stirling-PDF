import type { AppConfig } from '@app/contexts/AppConfigContext';
import type { LicenseInfo } from '@app/services/licenseService';

interface WauResponse {
  trackingSince: string;
  daysOnline: number;
  totalUniqueBrowsers: number;
  weeklyActiveUsers: number;
}

interface AdminUsageResponse {
  totalUsers?: number;
}

interface SimulationScenario {
  /**
   * Human-friendly label describing the scenario.
   * Keep in sync with the comment map below.
   */
  label: string;
  appConfig: AppConfig;
  wau?: WauResponse;
  adminUsage?: AdminUsageResponse;
  licenseInfo: LicenseInfo;
}

const DEV_TESTING_MODE = false;

/**
 * Scenario index cheat sheet:
 *  0 → no-login-user-under-limit (no license)
 *  1 → no-login-admin-under-limit (no license)
 *  2 → no-login-user-over-limit (no license)
 *  3 → no-login-admin-over-limit (no license)
 *  4 → login-user-under-limit (no license)
 *  5 → login-admin-under-limit (no license)
 *  6 → login-user-over-limit (no license)
 *  7 → login-admin-over-limit (no license)
 */
const SIMULATION_INDEX = 0;

const FREE_LICENSE_INFO: LicenseInfo = {
  licenseType: 'NORMAL',
  enabled: false,
  maxUsers: 5,
  hasKey: false,
};

const BASE_NO_LOGIN_CONFIG: AppConfig = {
  enableAnalytics: true,
  appVersion: '2.0.3',
  serverCertificateEnabled: false,
  enableAlphaFunctionality: false,
  serverPort: 8080,
  premiumEnabled: false,
  runningProOrHigher: false,
  runningEE: false,
  enableLogin: false,
  activeSecurity: false,
  languages: [],
  contextPath: '/',
  license: 'NORMAL',
  baseUrl: 'http://localhost',
  enableEmailInvites: true,
};

const BASE_LOGIN_CONFIG: AppConfig = {
  ...BASE_NO_LOGIN_CONFIG,
  enableLogin: true,
  activeSecurity: true,
};

const SIMULATION_SCENARIOS: SimulationScenario[] = [
  {
    label: 'no-login-user-under-limit (no-license)',
    appConfig: {
      ...BASE_NO_LOGIN_CONFIG,
    },
    wau: {
      trackingSince: '2025-11-18T23:20:12.520884200Z',
      daysOnline: 0,
      totalUniqueBrowsers: 3,
      weeklyActiveUsers: 3,
    },
    licenseInfo: { ...FREE_LICENSE_INFO },
  },
  {
    label: 'no-login-admin-under-limit (no-license)',
    appConfig: {
      ...BASE_NO_LOGIN_CONFIG,
    },
    wau: {
      trackingSince: '2025-10-01T00:00:00Z',
      daysOnline: 14,
      totalUniqueBrowsers: 4,
      weeklyActiveUsers: 4,
    },
    licenseInfo: { ...FREE_LICENSE_INFO },
  },
  {
    label: 'no-login-user-over-limit (no-license)',
    appConfig: {
      ...BASE_NO_LOGIN_CONFIG,
    },
    wau: {
      trackingSince: '2025-09-01T00:00:00Z',
      daysOnline: 30,
      totalUniqueBrowsers: 12,
      weeklyActiveUsers: 9,
    },
    licenseInfo: { ...FREE_LICENSE_INFO },
  },
  {
    label: 'no-login-admin-over-limit (no-license)',
    appConfig: {
      ...BASE_NO_LOGIN_CONFIG,
    },
    wau: {
      trackingSince: '2025-08-15T00:00:00Z',
      daysOnline: 45,
      totalUniqueBrowsers: 18,
      weeklyActiveUsers: 12,
    },
    licenseInfo: { ...FREE_LICENSE_INFO },
  },
  {
    label: 'login-user-under-limit (no-license)',
    appConfig: {
      ...BASE_LOGIN_CONFIG,
      isAdmin: false,
    },
    adminUsage: {
      totalUsers: 3,
    },
    licenseInfo: { ...FREE_LICENSE_INFO },
  },
  {
    label: 'login-admin-under-limit (no-license)',
    appConfig: {
      ...BASE_LOGIN_CONFIG,
      isAdmin: true,
    },
    adminUsage: {
      totalUsers: 4,
    },
    licenseInfo: { ...FREE_LICENSE_INFO },
  },
  {
    label: 'login-user-over-limit (no-license)',
    appConfig: {
      ...BASE_LOGIN_CONFIG,
      isAdmin: false,
    },
    adminUsage: {
      totalUsers: 12,
    },
    licenseInfo: { ...FREE_LICENSE_INFO },
  },
  {
    label: 'login-admin-over-limit (no-license)',
    appConfig: {
      ...BASE_LOGIN_CONFIG,
      isAdmin: true,
    },
    adminUsage: {
      totalUsers: 57,
    },
    licenseInfo: { ...FREE_LICENSE_INFO },
  },
];

function getActiveScenario(): SimulationScenario | null {
  if (!DEV_TESTING_MODE) {
    return null;
  }
  const scenario = SIMULATION_SCENARIOS[SIMULATION_INDEX];
  if (!scenario) {
    console.warn('[Simulation] SIMULATION_INDEX out of range, using live backend.');
    return null;
  }
  console.warn(`[Simulation] Using scenario #${SIMULATION_INDEX} (${scenario.label}).`);
  return scenario;
}

export function getSimulatedAppConfig(): AppConfig | null {
  return getActiveScenario()?.appConfig ?? null;
}

export function getSimulatedWauResponse(): WauResponse | null {
  return getActiveScenario()?.wau ?? null;
}

export function getSimulatedAdminUsage(): AdminUsageResponse | null {
  return getActiveScenario()?.adminUsage ?? null;
}

export function getSimulatedLicenseInfo(): LicenseInfo | null {
  return getActiveScenario()?.licenseInfo ?? null;
}

export const DEV_TESTING_ENABLED = DEV_TESTING_MODE;

