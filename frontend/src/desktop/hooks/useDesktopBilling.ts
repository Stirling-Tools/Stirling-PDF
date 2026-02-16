import { useState, useEffect, useCallback } from 'react';
import { desktopBillingService, BillingStatus } from '@app/services/desktopBillingService';
import { connectionModeService } from '@app/services/connectionModeService';

/**
 * Return type for useDesktopBilling hook
 */
export interface UseDesktopBillingReturn {
  subscription: BillingStatus['subscription'];
  usage: BillingStatus['meterUsage'];
  tier: BillingStatus['tier'];
  isTrialing: boolean;
  trialDaysRemaining?: number;
  price?: number;
  currency?: string;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook for fetching and managing desktop billing data
 * Only fetches data when in SaaS mode
 *
 * @param enabled - Whether to fetch billing data (default: true). Set to false for managed team members.
 */
export function useDesktopBilling(enabled: boolean = true): UseDesktopBillingReturn {
  const [billingData, setBillingData] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBillingData = useCallback(async () => {
    console.log('[useDesktopBilling] Fetching billing data...');
    setLoading(true);
    setError(null);

    try {
      // Skip fetch if disabled (e.g., for managed team members)
      if (!enabled) {
        console.log('[useDesktopBilling] Billing fetch disabled (managed team member)');
        setBillingData(null);
        setLoading(false);
        return;
      }

      // Check if billing is available (SaaS mode + authenticated)
      const isAvailable = await desktopBillingService.isBillingAvailable();

      if (!isAvailable) {
        console.log('[useDesktopBilling] Billing not available (not in SaaS mode or not authenticated)');
        setBillingData(null);
        setLoading(false);
        return;
      }

      // Fetch billing status
      const data = await desktopBillingService.getBillingStatus();
      setBillingData(data);
      console.log('[useDesktopBilling] Billing data fetched successfully');
    } catch (err) {
      console.error('[useDesktopBilling] Failed to fetch billing data:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch billing data';
      setError(errorMessage);
      setBillingData(null);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  // Fetch on mount (only if enabled)
  useEffect(() => {
    if (enabled) {
      fetchBillingData();
    } else {
      setLoading(false);
    }
  }, [fetchBillingData, enabled]);

  // Subscribe to connection mode changes (refetch when switching to/from SaaS)
  useEffect(() => {
    const unsubscribe = connectionModeService.subscribeToModeChanges(() => {
      console.log('[useDesktopBilling] Connection mode changed, refetching billing data');
      fetchBillingData();
    });

    return unsubscribe;
  }, [fetchBillingData]);

  return {
    subscription: billingData?.subscription ?? null,
    usage: billingData?.meterUsage ?? null,
    tier: billingData?.tier ?? 'free',
    isTrialing: billingData?.isTrialing ?? false,
    trialDaysRemaining: billingData?.trialDaysRemaining,
    price: billingData?.price,
    currency: billingData?.currency,
    loading,
    error,
    refetch: fetchBillingData,
  };
}
