import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
  useRef,
  useMemo,
} from "react";
import {
  saasBillingService,
  BillingStatus,
  PlanPrice,
} from "@app/services/saasBillingService";
import { authService } from "@app/services/authService";
import { connectionModeService } from "@app/services/connectionModeService";
import { useSaaSTeam } from "@app/contexts/SaaSTeamContext";
import type { TierLevel } from "@app/types/billing";

// How long plan pricing is considered fresh. Lives at module level so both the
// provider and usePlanPricing (the consumer hook) can reference it.
const PLANS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

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
  subscription: BillingStatus["subscription"];
  usage: BillingStatus["meterUsage"];
  isTrialing: boolean;
  trialDaysRemaining?: number;
  price?: number;
  currency?: string;
  creditBalance: number; // Real-time remaining credits

  // Available Plans
  plans: Map<string, PlanPrice>;
  plansLoading: boolean;
  plansError: string | null;
  plansLastFetchTime: number | null;

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
  tier: "free",
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
  plansLastFetchTime: null,
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
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(
    null,
  );
  const [plans, setPlans] = useState<Map<string, PlanPrice>>(new Map());
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false); // Start false (lazy load)
  const [error, setError] = useState<string | null>(null);
  // lastFetchTimeRef is the source of truth for cache logic (always current, no stale closure).
  // lastFetchTimeValue mirrors it as state purely to drive re-renders and expose through context.
  const lastFetchTimeRef = useRef<number | null>(null);
  const [lastFetchTimeValue, setLastFetchTimeValue] = useState<number | null>(
    null,
  );
  // billingStatusRef mirrors billingStatus so fetchBillingData can read the current value
  // without needing billingStatus in its useCallback dep array.
  const billingStatusRef = useRef<BillingStatus | null>(null);
  // plansLastFetchTimeRef is the source of truth for timing; plansLastFetchTimeValue
  // is the state mirror exposed via context so consumers can react to it.
  const plansLastFetchTimeRef = useRef<number | null>(null);
  const [plansLastFetchTimeValue, setPlansLastFetchTimeValue] = useState<
    number | null
  >(null);
  // In-flight deduplication — prevents concurrent duplicate network requests.
  const plansFetchInProgressRef = useRef(false);
  const [isSaasMode, setIsSaasMode] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Access team context for derived state
  const {
    currentTeam,
    isPersonalTeam,
    isTeamLeader,
    loading: teamLoading,
  } = useSaaSTeam();

  // Compute derived state: user is managed member if in non-personal team but not leader
  const isManagedTeamMember = currentTeam
    ? !isPersonalTeam && !isTeamLeader
    : false;

  // Check if in SaaS mode and authenticated (same pattern as SaaSTeamContext)
  useEffect(() => {
    const checkAccess = async () => {
      const mode = await connectionModeService.getCurrentMode();
      const auth = await authService.isAuthenticated();
      setIsSaasMode(mode === "saas");
      setIsAuthenticated(auth);
    };

    checkAccess();

    // Subscribe to connection mode changes
    const unsubscribe =
      connectionModeService.subscribeToModeChanges(checkAccess);
    return unsubscribe;
  }, []);

  // Subscribe to auth changes
  useEffect(() => {
    const unsubscribe = authService.subscribeToAuth((status) => {
      setIsAuthenticated(status === "authenticated");
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
    if (
      billingStatusRef.current &&
      lastFetchTimeRef.current &&
      now - lastFetchTimeRef.current < 300000
    ) {
      return;
    }

    // Only set loading if no existing data (prevents flicker on refresh)
    if (!billingStatusRef.current) {
      setLoading(true);
    }

    try {
      const status = await saasBillingService.getBillingStatus();
      billingStatusRef.current = status;
      setBillingStatus(status);
      lastFetchTimeRef.current = now;
      setLastFetchTimeValue(now);
      setError(null);
    } catch (err) {
      console.error("[SaasBillingContext] Failed to fetch billing:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch billing");
      // Don't clear billing status on error (preserve existing data)
    } finally {
      setLoading(false);
    }
  }, [isSaasMode, isAuthenticated, isManagedTeamMember, teamLoading]);

  // Raw plan fetch — auth guard + in-flight deduplication only.
  // TTL cache logic lives in usePlanPricing so the consumer hook controls staleness policy.
  const fetchPlansData = useCallback(async () => {
    if (!isSaasMode || !isAuthenticated) {
      return;
    }

    if (plansFetchInProgressRef.current) {
      return;
    }

    plansFetchInProgressRef.current = true;
    setPlansLoading(true);
    setPlansError(null);

    try {
      const priceMap = await saasBillingService.getAvailablePlans("usd");
      setPlans(priceMap);
      const now = Date.now();
      plansLastFetchTimeRef.current = now;
      setPlansLastFetchTimeValue(now);
    } catch (err) {
      console.error("[SaasBillingContext] Failed to fetch plans:", err);
      setPlansError(
        err instanceof Error ? err.message : "Failed to fetch plans",
      );
    } finally {
      plansFetchInProgressRef.current = false;
      setPlansLoading(false);
    }
  }, [isSaasMode, isAuthenticated]);

  // Clear data when leaving SaaS mode or logging out
  useEffect(() => {
    if (!isSaasMode || !isAuthenticated) {
      // Clear state when not in SaaS mode or not authenticated
      billingStatusRef.current = null;
      setBillingStatus(null);
      setPlans(new Map());
      lastFetchTimeRef.current = null;
      setLastFetchTimeValue(null);
      plansLastFetchTimeRef.current = null;
      setPlansLastFetchTimeValue(null);
      plansFetchInProgressRef.current = false;
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
      billingStatusRef.current === null &&
      lastFetchTimeRef.current === null
    ) {
      fetchBillingData();
    }
  }, [
    isSaasMode,
    isAuthenticated,
    teamLoading,
    isManagedTeamMember,
    fetchBillingData,
  ]);

  // Public refresh methods
  const refreshBilling = useCallback(async () => {
    if (!isSaasMode || !isAuthenticated) {
      return;
    }

    // Force cache invalidation — write to ref synchronously so fetchBillingData
    // reads null immediately (not a stale closure value from the previous render).
    lastFetchTimeRef.current = null;
    setLastFetchTimeValue(null);
    await fetchBillingData();
  }, [isSaasMode, isAuthenticated, fetchBillingData]);

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

      if (typeof newBalance === "number" && billingStatus) {
        // Update credit balance in billing status without full refresh
        const updated = { ...billingStatus, creditBalance: newBalance };
        billingStatusRef.current = updated;
        setBillingStatus(updated);

        // Dispatch exhausted event if credits hit 0
        if (newBalance <= 0 && (billingStatus.creditBalance ?? 0) > 0) {
          window.dispatchEvent(
            new CustomEvent("credits:exhausted", {
              detail: {
                previousBalance: billingStatus.creditBalance ?? 0,
                currentBalance: newBalance,
              },
            }),
          );
        }
      }
    };

    window.addEventListener("credits:updated", handleCreditsUpdated);
    return () => {
      window.removeEventListener("credits:updated", handleCreditsUpdated);
    };
  }, [billingStatus]);

  const contextValue = useMemo(
    () => ({
      billingStatus,
      tier: isManagedTeamMember ? "team" : (billingStatus?.tier ?? "free"),
      subscription: billingStatus?.subscription ?? null,
      usage: billingStatus?.meterUsage ?? null,
      isTrialing: billingStatus?.isTrialing ?? false,
      trialDaysRemaining: billingStatus?.trialDaysRemaining,
      price: plans.get("team")?.price,
      currency: plans.get("team")?.currency,
      creditBalance: billingStatus?.creditBalance ?? 0,
      plans,
      plansLoading,
      plansError,
      plansLastFetchTime: plansLastFetchTimeValue,
      isManagedTeamMember,
      loading: loading || teamLoading,
      error,
      lastFetchTime: lastFetchTimeValue,
      refreshBilling,
      refreshCredits: refreshBilling,
      refreshPlans,
      openBillingPortal,
    }),
    [
      billingStatus,
      isManagedTeamMember,
      plans,
      plansLoading,
      plansError,
      plansLastFetchTimeValue,
      loading,
      teamLoading,
      error,
      lastFetchTimeValue,
      refreshBilling,
      refreshPlans,
      openBillingPortal,
    ],
  );

  return (
    <SaasBillingContext.Provider value={contextValue}>
      {children}
    </SaasBillingContext.Provider>
  );
}

export function useSaaSBilling() {
  const context = useContext(SaasBillingContext);
  if (context === undefined) {
    throw new Error("useSaaSBilling must be used within SaasBillingProvider");
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
  }, [
    context.billingStatus,
    context.lastFetchTime,
    context.loading,
    context.isManagedTeamMember,
    context.refreshBilling,
  ]);

  return context;
}

/**
 * Hook for components that display plan pricing data.
 * Fetches on first use; re-fetches only after PLANS_CACHE_TTL_MS (1 hour).
 * Safe to call from multiple components — in-flight deduplication is handled by fetchPlansData.
 */
export function usePlanPricing() {
  const { plans, plansLoading, plansError, plansLastFetchTime, refreshPlans } =
    useContext(SaasBillingContext);

  useEffect(() => {
    const isFresh =
      plansLastFetchTime !== null &&
      Date.now() - plansLastFetchTime < PLANS_CACHE_TTL_MS;

    if (!isFresh) {
      refreshPlans();
    }
  }, [plansLastFetchTime, refreshPlans]);

  return { plans, plansLoading, plansError };
}

export { SaasBillingContext };
export type { SaasBillingContextType };
