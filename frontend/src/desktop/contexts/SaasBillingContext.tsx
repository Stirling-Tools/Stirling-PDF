import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { saasBillingService, BillingStatus, PlanPrice } from '@app/services/saasBillingService';
import { authService } from '@app/services/authService';
import { connectionModeService } from '@app/services/connectionModeService';
import { useSaaSTeam } from '@app/contexts/SaaSTeamContext';
import type { TierLevel } from '@app/types/billing';

/**
 * Desktop implementation of SaaS Billing Context
 * Provides billing and plan management for users connected to SaaS backend
 * CRITICAL: Only active when in SaaS mode - all API calls check connection mode first
 *
 * Features:
 * - Centralized billing state management
 * - Automatic caching (5-minute TTL)
 * - Lazy loading (fetches on first access)
 * - Auto-refresh after checkout/portal
 * - No flickering (preserves data during refresh)
 */

interface SaasBillingContextType {
  // Billing Status
  billingStatus: BillingStatus | null;
  tier: TierLevel;
  subscription: BillingStatus['subscription'];
  usage: BillingStatus['meterUsage'];
  isTrialing: boolean;
  trialDaysRemaining?: number;
  price?: number;
  currency?: string;
  creditBalance: number; // Real-time remaining credits

  // Available Plans
  plans: Map<string, PlanPrice>;
  plansLoading: boolean;
  plansError: string | null;

  // Derived State
  isManagedTeamMember: boolean;

  // State Flags
  loading: boolean;
  error: string | null;
  lastFetchTime: number | null;

  // Actions
  refreshBilling: () => Promise<void>;
  refreshCredits: () => Promise<void>; // Alias for refreshBilling (for clarity)
  refreshPlans: () => Promise<void>;
  openBillingPortal: () => Promise<void>;
}

const SaasBillingContext = createContext<SaasBillingContextType>({
  billingStatus: null,
  tier: 'free',
  subscription: null,
  usage: null,
  isTrialing: false,
  trialDaysRemaining: undefined,
  price: undefined,
  currency: undefined,
  creditBalance: 0,
  plans: new Map(),
  plansLoading: false,
  plansError: null,
  isManagedTeamMember: false,
  loading: false,
  error: null,
  lastFetchTime: null,
  refreshBilling: async () => {},
  refreshCredits: async () => {},
  refreshPlans: async () => {},
  openBillingPortal: async () => {},
});

export function SaasBillingProvider({ children }: { children: ReactNode }) {
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [plans, setPlans] = useState<Map<string, PlanPrice>>(new Map());
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);  // Start false (lazy load)
  const [error, setError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number | null>(null);
  const [isSaasMode, setIsSaasMode] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Access team context for derived state
  const { currentTeam, isPersonalTeam, isTeamLeader, loading: teamLoading } = useSaaSTeam();

  // Compute derived state: user is managed member if in non-personal team but not leader
  const isManagedTeamMember = currentTeam ? !isPersonalTeam && !isTeamLeader : false;

  // Check if in SaaS mode and authenticated (same pattern as SaaSTeamContext)
  useEffect(() => {
    const checkAccess = async () => {
      const mode = await connectionModeService.getCurrentMode();
      const auth = await authService.isAuthenticated();
      setIsSaasMode(mode === 'saas');
      setIsAuthenticated(auth);
    };

    checkAccess();

    // Subscribe to connection mode changes
    const unsubscribe = connectionModeService.subscribeToModeChanges(checkAccess);
    return unsubscribe;
  }, []);

  // Subscribe to auth changes
  useEffect(() => {
    const unsubscribe = authService.subscribeToAuth((status) => {
      setIsAuthenticated(status === 'authenticated');
    });
    return unsubscribe;
  }, []);

  // Fetch billing status with caching
  const fetchBillingData = useCallback(async () => {
    // Guard: Skip if not in SaaS mode or not authenticated
    if (!isSaasMode || !isAuthenticated) {
      return;
    }

    // Guard: Wait for team context to load before determining managed status
    if (teamLoading) {
      return;
    }

    // Guard: Skip if managed team member (billing managed by leader)
    if (isManagedTeamMember) {
      return;
    }

    // Cache check: Skip if fresh data exists (<5 min old)
    const now = Date.now();
    if (billingStatus && lastFetchTime && (now - lastFetchTime) < 300000) {
      return;
    }

    // Only set loading if no existing data (prevents flicker on refresh)
    if (!billingStatus) {
      setLoading(true);
    }

    try {
      const status = await saasBillingService.getBillingStatus();
      setBillingStatus(status);  // Atomic update
      setLastFetchTime(now);
      setError(null);
    } catch (err) {
      console.error('[SaasBillingContext] Failed to fetch billing:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch billing');
      // Don't clear billing status on error (preserve existing data)
    } finally {
      setLoading(false);
    }
  }, [isSaasMode, isAuthenticated, isManagedTeamMember, billingStatus, lastFetchTime, teamLoading]);

  // Fetch available plans
  const fetchPlansData = useCallback(async () => {
    // Guard: Skip if not in SaaS mode or not authenticated
    if (!isSaasMode || !isAuthenticated) {
      return;
    }

    setPlansLoading(true);
    setPlansError(null);

    try {
      const priceMap = await saasBillingService.getAvailablePlans('usd');
      setPlans(priceMap);
    } catch (err) {
      console.error('[SaasBillingContext] Failed to fetch plans:', err);
      setPlansError(err instanceof Error ? err.message : 'Failed to fetch plans');
      // Non-blocking: continue with empty plans
    } finally {
      setPlansLoading(false);
    }
  }, [isSaasMode, isAuthenticated]);

  // Clear data when leaving SaaS mode or logging out
  useEffect(() => {
    if (!isSaasMode || !isAuthenticated) {
      // Clear state when not in SaaS mode or not authenticated
      setBillingStatus(null);
      setPlans(new Map());
      setLastFetchTime(null);
      setLoading(false);
      setError(null);
      setPlansError(null);
    }
  }, [isSaasMode, isAuthenticated]);

  // Auto-fetch billing when team context finishes loading
  useEffect(() => {
    // Only fetch if: in SaaS mode, authenticated, team finished loading, and haven't fetched yet
    if (
      isSaasMode &&
      isAuthenticated &&
      !teamLoading &&
      !isManagedTeamMember &&
      billingStatus === null &&
      lastFetchTime === null
    ) {
      fetchBillingData();
    }
  }, [isSaasMode, isAuthenticated, teamLoading, isManagedTeamMember, billingStatus, lastFetchTime, fetchBillingData]);

  // Public refresh methods
  const refreshBilling = useCallback(async () => {
    if (!isSaasMode || !isAuthenticated) {
      return;
    }

    // Force cache invalidation
    setLastFetchTime(null);
    await fetchBillingData();
    await fetchPlansData();
  }, [isSaasMode, isAuthenticated, fetchBillingData, fetchPlansData]);

  const refreshPlans = useCallback(async () => {
    await fetchPlansData();
  }, [fetchPlansData]);

  const openBillingPortal = useCallback(async () => {
    const returnUrl = window.location.href;
    await saasBillingService.openBillingPortal(returnUrl);

    // Auto-refresh after portal (delayed for webhook processing)
    setTimeout(() => {
      refreshBilling();
    }, 3000);
  }, [refreshBilling]);

  // Listen for credit updates from API response headers (immediate, no fetch)
  useEffect(() => {
    const handleCreditsUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ creditsRemaining: number }>;
      const newBalance = customEvent.detail?.creditsRemaining;

      if (typeof newBalance === 'number' && billingStatus) {
        // Update credit balance in billing status without full refresh
        setBillingStatus({
          ...billingStatus,
          creditBalance: newBalance,
        });

        // Dispatch exhausted event if credits hit 0
        if (newBalance <= 0 && (billingStatus.creditBalance ?? 0) > 0) {
          window.dispatchEvent(new CustomEvent('credits:exhausted', {
            detail: { previousBalance: billingStatus.creditBalance ?? 0, currentBalance: newBalance }
          }));
        }
      }
    };

    window.addEventListener('credits:updated', handleCreditsUpdated);
    return () => {
      window.removeEventListener('credits:updated', handleCreditsUpdated);
    };
  }, [billingStatus]);

  return (
    <SaasBillingContext.Provider value={{
      billingStatus,
      tier: isManagedTeamMember ? 'team' : (billingStatus?.tier ?? 'free'),
      subscription: billingStatus?.subscription ?? null,
      usage: billingStatus?.meterUsage ?? null,
      isTrialing: billingStatus?.isTrialing ?? false,
      trialDaysRemaining: billingStatus?.trialDaysRemaining,
      price: billingStatus?.price,
      currency: billingStatus?.currency,
      creditBalance: billingStatus?.creditBalance ?? 0,
      plans,
      plansLoading,
      plansError,
      isManagedTeamMember,
      loading: loading || teamLoading,
      error,
      lastFetchTime,
      refreshBilling,
      refreshCredits: refreshBilling, // Alias for clarity
      refreshPlans,
      openBillingPortal,
    }}>
      {children}
    </SaasBillingContext.Provider>
  );
}

export function useSaaSBilling() {
  const context = useContext(SaasBillingContext);
  if (context === undefined) {
    throw new Error('useSaaSBilling must be used within SaasBillingProvider');
  }

  // Lazy fetch: Trigger fetch on first access (after team context loads)
  // Note: context.loading includes teamLoading, so this waits for team to load
  useEffect(() => {
    const needsFetch =
      context.billingStatus === null &&
      context.lastFetchTime === null &&
      !context.loading &&
      !context.isManagedTeamMember; // Managed members don't need billing data

    if (needsFetch) {
      context.refreshBilling();
    }
  }, [context.billingStatus, context.lastFetchTime, context.loading, context.isManagedTeamMember, context.refreshBilling]);

  return context;
}

export { SaasBillingContext };
export type { SaasBillingContextType };
