import { useState, useEffect, useCallback } from "react";
import licenseService, {
  PlanTier,
  PlansResponse,
} from "@app/services/licenseService";
import {
  usePlanFeatures,
  usePlanHighlights,
} from "@app/constants/planConstants";

export interface UsePlansReturn {
  plans: PlanTier[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const usePlans = (currency: string = "gbp"): UsePlansReturn => {
  const planFeatures = usePlanFeatures();
  const planHighlights = usePlanHighlights();
  const [plans, setPlans] = useState<PlanTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data: PlansResponse = await licenseService.getPlans(
        planFeatures,
        planHighlights,
        currency,
      );
      setPlans(data.plans);
    } catch (err) {
      console.error("Error fetching plans:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch plans");
    } finally {
      setLoading(false);
    }
  }, [currency, planFeatures, planHighlights]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  return {
    plans,
    loading,
    error,
    refetch: fetchPlans,
  };
};
