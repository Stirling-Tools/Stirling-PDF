import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppConfig } from '@app/contexts/AppConfigContext';

const SELF_REPORTED_ADMIN_KEY = 'stirling-self-reported-admin';
const FREE_TIER_LIMIT = 5;

type UserCountSource = 'admin' | 'estimate' | 'unknown';

export type ServerScenarioKey =
  | 'unknown'
  | 'licensed'
  | 'no-login-user-under-limit-no-license'
  | 'no-login-admin-under-limit-no-license'
  | 'no-login-user-over-limit-no-license'
  | 'no-login-admin-over-limit-no-license'
  | 'login-user-under-limit-no-license'
  | 'login-admin-under-limit-no-license'
  | 'login-user-over-limit-no-license'
  | 'login-admin-over-limit-no-license';

export interface ServerExperienceValue {
  loginEnabled: boolean;
  configIsAdmin: boolean;
  effectiveIsAdmin: boolean;
  selfReportedAdmin: boolean;
  isAuthenticated: boolean;
  isNewServer: boolean | null;
  isNewUser: boolean | null;
  premiumEnabled: boolean | null;
  license: string | undefined;
  runningProOrHigher: boolean | undefined;
  runningEE: boolean | undefined;
  hasPaidLicense: boolean;
  licenseKeyValid: boolean | null;
  licenseLoading: boolean;
  licenseInfoAvailable: boolean;
  totalUsers: number | null;
  weeklyActiveUsers: number | null;
  userCountLoading: boolean;
  userCountError: string | null;
  userCountSource: UserCountSource;
  userCountResolved: boolean;
  overFreeTierLimit: boolean | null;
  freeTierLimit: number;
  refreshUserCounts: () => Promise<void>;
  setSelfReportedAdmin: (value: boolean) => void;
  scenarioKey: ServerScenarioKey;
}

function readSelfReportedAdmin(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return window.localStorage.getItem(SELF_REPORTED_ADMIN_KEY) === 'true';
  } catch {
    return false;
  }
}

export function useServerExperience(): ServerExperienceValue {
  const { config } = useAppConfig();
  const [selfReportedAdmin, setSelfReportedAdminState] = useState<boolean>(readSelfReportedAdmin);

  const loginEnabled = config?.enableLogin !== false;
  const configIsAdmin = Boolean(config?.isAdmin);
  const effectiveIsAdmin = configIsAdmin || (!loginEnabled && selfReportedAdmin);
  const hasPaidLicense = config?.license === 'SERVER' || config?.license === 'PRO' || config?.license === 'ENTERPRISE';

  const setSelfReportedAdmin = useCallback((value: boolean) => {
    setSelfReportedAdminState(value);
    if (typeof window === 'undefined') {
      return;
    }
    try {
      if (value) {
        window.localStorage.setItem(SELF_REPORTED_ADMIN_KEY, 'true');
      } else {
        window.localStorage.removeItem(SELF_REPORTED_ADMIN_KEY);
      }
    } catch {
      // ignore storage write failures
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key === SELF_REPORTED_ADMIN_KEY) {
        setSelfReportedAdminState(event.newValue === 'true');
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    if (config?.isNewServer && !loginEnabled && !selfReportedAdmin) {
      setSelfReportedAdmin(true);
    }
  }, [config?.isNewServer, loginEnabled, selfReportedAdmin, setSelfReportedAdmin]);

  const scenarioKey: ServerScenarioKey = useMemo(() => {
    if (hasPaidLicense) {
      return 'licensed';
    }
    return 'unknown';
  }, [hasPaidLicense]);

  const value = useMemo<ServerExperienceValue>(() => ({
    loginEnabled,
    configIsAdmin,
    effectiveIsAdmin,
    selfReportedAdmin,
    isAuthenticated: false,
    isNewServer: config?.isNewServer ?? null,
    isNewUser: config?.isNewUser ?? null,
    premiumEnabled: config?.premiumEnabled ?? null,
    license: config?.license,
    runningProOrHigher: config?.runningProOrHigher,
    runningEE: config?.runningEE,
    hasPaidLicense,
    licenseKeyValid: config?.premiumEnabled ?? null,
    licenseLoading: false,
    licenseInfoAvailable: false,
    totalUsers: null,
    weeklyActiveUsers: null,
    userCountLoading: false,
    userCountError: null,
    userCountSource: 'unknown',
    userCountResolved: false,
    overFreeTierLimit: null,
    freeTierLimit: FREE_TIER_LIMIT,
    refreshUserCounts: async () => {},
    setSelfReportedAdmin,
    scenarioKey,
  }), [
    config?.isNewServer,
    config?.isNewUser,
    config?.license,
    config?.premiumEnabled,
    config?.runningEE,
    config?.runningProOrHigher,
    configIsAdmin,
    effectiveIsAdmin,
    hasPaidLicense,
    loginEnabled,
    scenarioKey,
    selfReportedAdmin,
    setSelfReportedAdmin,
  ]);

  return value;
}

