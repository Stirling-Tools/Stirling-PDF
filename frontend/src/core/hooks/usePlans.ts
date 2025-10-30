import { useState, useEffect } from 'react';
import licenseService, {
  PlanTier,
  SubscriptionInfo,
  PlansResponse,
} from '@app/services/licenseService';

export interface UsePlansReturn {
  plans: PlanTier[];
  currentSubscription: SubscriptionInfo | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const usePlans = (currency: string = 'gbp'): UsePlansReturn => {
  const [plans, setPlans] = useState<PlanTier[]>([]);
  const [currentSubscription, setCurrentSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      setError(null);

      const data: PlansResponse = await licenseService.getPlans(currency);
      setPlans(data.plans);
      setCurrentSubscription(data.currentSubscription);
    } catch (err) {
      console.error('Error fetching plans:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch plans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, [currency]);

  return {
    plans,
    currentSubscription,
    loading,
    error,
    refetch: fetchPlans,
  };
};
