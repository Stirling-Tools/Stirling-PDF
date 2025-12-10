import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import apiClient from '@app/services/apiClient';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import { useAuth } from '@app/auth/UseSession';
import { useLicense } from '@app/contexts/LicenseContext';
import {
  getSimulatedAdminUsage,
  getSimulatedWauResponse,
} from '@app/testing/serverExperienceSimulations';

const SELF_REPORTED_ADMIN_KEY = 'stirling-self-reported-admin';
const FREE_TIER_LIMIT = 5;

type UserCountSource = 'admin' | 'estimate' | 'unknown';

interface WeeklyActiveUsersResponse {
  trackingSince: string;
  daysOnline: number;
  totalUniqueBrowsers: number;
  weeklyActiveUsers: number;
}

interface UserCountState {
  totalUsers: number | null;
  weeklyActiveUsers: number | null;
  loading: boolean;
  source: UserCountSource;
  lastUpdated: number | null;
  error: string | null;
}

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

const ServerExperienceContext = createContext<ServerExperienceValue | undefined>(undefined);

function getStoredSelfReportedAdmin(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return window.localStorage.getItem(SELF_REPORTED_ADMIN_KEY) === 'true';
  } catch {
    return false;
  }
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as any).response?.data?.message === 'string'
  ) {
    return (error as any).response.data.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unable to load server usage';
}

export function ServerExperienceProvider({ children }: { children: ReactNode }) {
  const { config } = useAppConfig();
  const { user } = useAuth();
  const { licenseInfo, loading: licenseLoading } = useLicense();

  const [selfReportedAdmin, setSelfReportedAdminState] = useState<boolean>(getStoredSelfReportedAdmin);
  const [userCountState, setUserCountState] = useState<UserCountState>({
    totalUsers: null,
    weeklyActiveUsers: null,
    loading: false,
    source: 'unknown',
    lastUpdated: null,
    error: null,
  });

  const loginEnabled = config?.enableLogin !== false;
  const configIsAdmin = Boolean(config?.isAdmin);
  const effectiveIsAdmin = configIsAdmin || (!loginEnabled && selfReportedAdmin);
  const isAuthenticated = Boolean(user);

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
      // ignore storage failures
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
    if (!config) {
      return;
    }
    if (config.isNewServer && !loginEnabled && !selfReportedAdmin) {
      setSelfReportedAdmin(true);
    }
  }, [config, loginEnabled, selfReportedAdmin, setSelfReportedAdmin]);

  const fetchUserCounts = useCallback(async () => {
    if (!config) {
      return;
    }

    const shouldUseAdminData = (config.enableLogin ?? true) && config.isAdmin;
    // Use WAU estimate for no-login scenarios OR for login non-admin users
    const shouldUseEstimate = config.enableLogin === false || !config.isAdmin;

    setUserCountState((prev) => ({
      ...prev,
      loading: true,
      error: null,
    }));

    try {
      if (shouldUseAdminData) {
        const testResponse = getSimulatedAdminUsage();
        const responseData =
          testResponse ??
          (
            await apiClient.get<{ totalUsers?: number }>(
              '/api/v1/proprietary/ui-data/admin-settings',
              { suppressErrorToast: true } as any,
            )
          ).data;
        const totalUsers =
          typeof responseData?.totalUsers === 'number' ? responseData.totalUsers : null;
        setUserCountState({
          totalUsers,
          weeklyActiveUsers: null,
          loading: false,
          source: 'admin',
          lastUpdated: Date.now(),
          error: null,
        });
        return;
      }

      if (shouldUseEstimate) {
        const testResponse = getSimulatedWauResponse();
        const responseData =
          testResponse ??
          (
            await apiClient.get<WeeklyActiveUsersResponse>('/api/v1/info/wau', {
              suppressErrorToast: true,
            } as any)
          ).data;
        const weeklyActiveUsers =
          typeof responseData?.weeklyActiveUsers === 'number'
            ? responseData.weeklyActiveUsers
            : null;
        setUserCountState({
          totalUsers: weeklyActiveUsers,
          weeklyActiveUsers,
          loading: false,
          source: 'estimate',
          lastUpdated: Date.now(),
          error: null,
        });
      }
    } catch (error) {
      setUserCountState({
        totalUsers: null,
        weeklyActiveUsers: null,
        loading: false,
        source: 'unknown',
        lastUpdated: null,
        error: getErrorMessage(error),
      });
    }
  }, [config]);

  useEffect(() => {
    void fetchUserCounts();
  }, [fetchUserCounts]);

  const refreshUserCounts = useCallback(async () => {
    await fetchUserCounts();
  }, [fetchUserCounts]);

  const hasPaidLicense = useMemo(() => {
    return config?.license === 'SERVER' || config?.license === 'PRO' || config?.license === 'ENTERPRISE';
  }, [config?.license]);

  const licenseKeyValid = useMemo(() => {
    if (licenseInfo) {
      return licenseInfo.hasKey && licenseInfo.enabled;
    }
    if (config?.premiumEnabled) {
      return true;
    }
    return null;
  }, [config?.premiumEnabled, licenseInfo]);

  const overFreeTierLimit = useMemo(() => {
    if (typeof userCountState.totalUsers !== 'number') {
      return null;
    }
    return userCountState.totalUsers > FREE_TIER_LIMIT;
  }, [userCountState.totalUsers]);

  const userCountResolved =
    !userCountState.loading && userCountState.source !== 'unknown' && userCountState.totalUsers !== null;

  const scenarioKey = useMemo<ServerScenarioKey>(() => {
    if (hasPaidLicense) {
      return 'licensed';
    }
    if (!userCountResolved || typeof userCountState.totalUsers !== 'number') {
      return 'unknown';
    }
    const overLimit = userCountState.totalUsers > FREE_TIER_LIMIT;

    if (!loginEnabled) {
      if (selfReportedAdmin) {
        return overLimit
          ? 'no-login-admin-over-limit-no-license'
          : 'no-login-admin-under-limit-no-license';
      }
      return overLimit
        ? 'no-login-user-over-limit-no-license'
        : 'no-login-user-under-limit-no-license';
    }

    if (configIsAdmin) {
      return overLimit
        ? 'login-admin-over-limit-no-license'
        : 'login-admin-under-limit-no-license';
    }

    return overLimit
      ? 'login-user-over-limit-no-license'
      : 'login-user-under-limit-no-license';
  }, [
    hasPaidLicense,
    userCountResolved,
    userCountState.totalUsers,
    loginEnabled,
    selfReportedAdmin,
    configIsAdmin,
  ]);

  const value: ServerExperienceValue = {
    loginEnabled,
    configIsAdmin,
    effectiveIsAdmin,
    selfReportedAdmin,
    isAuthenticated,
    isNewServer: config?.isNewServer ?? null,
    isNewUser: config?.isNewUser ?? null,
    premiumEnabled: config?.premiumEnabled ?? null,
    license: config?.license,
    runningProOrHigher: config?.runningProOrHigher,
    runningEE: config?.runningEE,
    hasPaidLicense,
    licenseKeyValid,
    licenseLoading,
    licenseInfoAvailable: Boolean(licenseInfo),
    totalUsers: userCountState.totalUsers,
    weeklyActiveUsers: userCountState.weeklyActiveUsers,
    userCountLoading: userCountState.loading,
    userCountError: userCountState.error,
    userCountSource: userCountState.source,
    userCountResolved,
    overFreeTierLimit,
    freeTierLimit: FREE_TIER_LIMIT,
    refreshUserCounts,
    setSelfReportedAdmin,
    scenarioKey,
  };

  return (
    <ServerExperienceContext.Provider value={value}>
      {children}
    </ServerExperienceContext.Provider>
  );
}

export function useServerExperienceContext() {
  const context = useContext(ServerExperienceContext);
  if (!context) {
    throw new Error('useServerExperience must be used within ServerExperienceProvider');
  }
  return context;
}

