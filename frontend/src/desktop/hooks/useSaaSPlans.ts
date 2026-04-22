import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  useSaaSBilling,
  usePlanPricing,
} from "@app/contexts/SaasBillingContext";
import {
  FREE_PLAN_FEATURES,
  TEAM_PLAN_FEATURES,
  ENTERPRISE_PLAN_FEATURES,
} from "@app/config/planFeatures";
import type { TierLevel } from "@app/types/billing";

export interface PlanFeature {
  name: string;
  included: boolean;
}

export interface PlanTier {
  id: TierLevel;
  name: string;
  price: number;
  currency: string;
  period: string;
  popular?: boolean;
  features: PlanFeature[];
  highlights: string[];
  isContactOnly?: boolean;
  overagePrice?: number;
}

export const useSaaSPlans = () => {
  const { t } = useTranslation();
  const { refreshPlans } = useSaaSBilling();
  const { plans, plansLoading, plansError } = usePlanPricing();

  const computedPlans = useMemo<PlanTier[]>(() => {
    const teamPlan = plans.get("team");

    return [
      {
        id: "free",
        name: t("plan.free.name", "Free"),
        price: 0,
        currency: "$",
        period: t("plan.period.month", "/month"),
        highlights: FREE_PLAN_FEATURES.map((f) =>
          t(f.translationKey, f.defaultText),
        ),
        features: [
          {
            name: t("plan.feature.pdfTools", "Basic PDF Tools"),
            included: true,
          },
          {
            name: t("plan.feature.fileSize", "File Size Limit"),
            included: false,
          },
          {
            name: t("plan.feature.automation", "Automate tool workflows"),
            included: false,
          },
          { name: t("plan.feature.api", "API Access"), included: false },
          {
            name: t("plan.feature.priority", "Priority Support"),
            included: false,
          },
          {
            name: t("plan.feature.customPricing", "Custom Pricing"),
            included: false,
          },
        ],
      },
      {
        id: "team",
        name: t("plan.team.name", "Team"),
        price: teamPlan?.price || 10,
        currency: teamPlan?.currency || "$",
        period: t("plan.period.month", "/month"),
        popular: true,
        overagePrice: teamPlan?.overagePrice || 0.05,
        highlights: TEAM_PLAN_FEATURES.map((f) =>
          t(f.translationKey, f.defaultText),
        ),
        features: [
          {
            name: t("plan.feature.pdfTools", "Basic PDF Tools"),
            included: true,
          },
          {
            name: t("plan.feature.fileSize", "File Size Limit"),
            included: true,
          },
          {
            name: t("plan.feature.automation", "Automate tool workflows"),
            included: true,
          },
          {
            name: t("plan.feature.api", "Monthly API Credits"),
            included: true,
          },
          {
            name: t("plan.feature.priority", "Priority Support"),
            included: false,
          },
          {
            name: t("plan.feature.customPricing", "Custom Pricing"),
            included: false,
          },
        ],
      },
      {
        id: "enterprise",
        name: t("plan.enterprise.name", "Enterprise"),
        price: 0,
        currency: "$",
        period: "",
        isContactOnly: true,
        highlights: ENTERPRISE_PLAN_FEATURES.map((f) =>
          t(f.translationKey, f.defaultText),
        ),
        features: [
          {
            name: t("plan.feature.pdfTools", "Basic PDF Tools"),
            included: true,
          },
          {
            name: t("plan.feature.fileSize", "File Size Limit"),
            included: true,
          },
          {
            name: t("plan.feature.automation", "Automate tool workflows"),
            included: true,
          },
          {
            name: t("plan.feature.api", "Monthly API Credits"),
            included: true,
          },
          {
            name: t("plan.feature.priority", "Priority Support"),
            included: true,
          },
          {
            name: t("plan.feature.customPricing", "Custom Pricing"),
            included: true,
          },
        ],
      },
    ];
  }, [t, plans]);

  return {
    plans: computedPlans,
    loading: plansLoading,
    error: plansError,
    refetch: refreshPlans,
  };
};
