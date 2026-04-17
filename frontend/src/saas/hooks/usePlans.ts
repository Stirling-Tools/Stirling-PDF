import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@app/auth/supabase";
import { useAuth } from "@app/auth/UseSession";

// Currency mapping
const getCurrencySymbol = (currency: string): string => {
  const currencySymbols: { [key: string]: string } = {
    gbp: "£",
    usd: "$",
    eur: "€",
    cny: "¥",
    inr: "₹",
    brl: "R$",
    idr: "Rp",
  };
  return currencySymbols[currency.toLowerCase()] || currency.toUpperCase();
};

export interface PlanFeature {
  name: string;
  included: boolean;
}

export interface PlanTier {
  id: string;
  name: string;
  price: number;
  currency: string;
  period: string;
  popular?: boolean;
  features: PlanFeature[];
  highlights: string[];
  isContactOnly?: boolean;
}

export interface ApiPackage {
  id: string;
  name: string;
  price: number;
  currency: string;
  credits: number;
  description: string;
}

export interface PlansData {
  plans: Map<string, PlanTier>;
  apiPackages: ApiPackage[];
  currentPlan: PlanTier;
  nextBillingDate?: string;
  activeSince?: string;
}

export const usePlans = (currency: string = "gbp") => {
  const { t } = useTranslation();
  const { isPro, refreshProStatus } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPlanId, setCurrentPlanId] = useState<string>("free");
  const [dynamicPrices, setDynamicPrices] = useState<
    Map<string, { unit_amount: number; currency: string }>
  >(new Map());

  const fetchPricing = async () => {
    try {
      setLoading(true);
      setError(null);

      const lookupKeys = [
        "plan:pro",
        "api:xsmall",
        "api:small",
        "api:medium",
        "api:large",
      ];

      const { data, error } = await supabase.functions.invoke<{
        prices: Record<string, { unit_amount: number; currency: string }>;
        missing: string[];
      }>("stripe-price-lookup", {
        body: { lookup_keys: lookupKeys, currency },
      });
      if (error) throw error;
      if (!data || !data.prices || !data.missing)
        throw new Error("No pricing data returned");
      console.log("Fetched pricing data:", data);

      const priceMap = new Map<
        string,
        { unit_amount: number; currency: string }
      >();
      // map your UI keys to lookup keys (if names differ)
      const keyMap: Record<string, string> = {
        pro: "plan:pro",
        xsmall: "api:xsmall",
        small: "api:small",
        medium: "api:medium",
        large: "api:large",
      };

      for (const [uiKey, lookupKey] of Object.entries(keyMap)) {
        const p = data?.prices?.[lookupKey];
        if (p) {
          priceMap.set(uiKey, {
            unit_amount: p.unit_amount ?? 0,
            currency: p.currency,
          });
        }
      }

      if (data.missing.length) {
        console.warn("Missing prices for", data.missing, "in", currency);
        // Optionally re-request with a fallback currency (e.g., 'usd')
      }

      setDynamicPrices(priceMap);
    } catch (err) {
      console.error("Error fetching pricing:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch pricing data",
      );
      // continue with static prices if needed
    } finally {
      setLoading(false);
    }
  };

  // Memoize static plan and package data to prevent recreation on every render
  const staticPlansData = useMemo(() => {
    const plans: PlanTier[] = [
      {
        id: "free",
        name: t("plan.free.name", "Free"),
        price: 0,
        currency: getCurrencySymbol(currency),
        period: t("plan.period.month", "/month"),
        highlights: [
          t("plan.free.highlight1", "Limited Tool Usage Per week"),
          t("plan.free.highlight2", "Access to all tools"),
          t("plan.free.highlight3", "Community support"),
        ],
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
            name: t("plan.feature.automation", "automate tool workflows"),
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
        id: "pro",
        name: t("plan.pro.name", "Pro"),
        price: dynamicPrices.get("pro")
          ? dynamicPrices.get("pro")!.unit_amount / 100
          : 8,
        currency: dynamicPrices.get("pro")
          ? getCurrencySymbol(dynamicPrices.get("pro")!.currency)
          : getCurrencySymbol(currency),
        period: t("plan.period.month", "/month"),
        popular: true,
        highlights: [
          t("plan.pro.highlight1", "Unlimited Tool Usage"),
          t("plan.pro.highlight2", "Advanced PDF tools"),
          t("plan.pro.highlight3", "No watermarks"),
        ],
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
            name: t("plan.feature.automation", "automate tool workflows"),
            included: true,
          },
          { name: t("plan.feature.api", "Weekly API Credits"), included: true },
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
        currency: getCurrencySymbol(currency),
        period: "",
        isContactOnly: true,
        highlights: [
          t("plan.enterprise.highlight1", "Custom pricing"),
          t("plan.enterprise.highlight2", "Dedicated support"),
          t("plan.enterprise.highlight3", "Latest features"),
        ],
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
            name: t("plan.feature.automation", "automate tool workflows"),
            included: true,
          },
          { name: t("plan.feature.api", "Weekly API Credits"), included: true },
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

    // Helper function to get price info
    const getPriceInfo = (key: string, fallbackPrice: number) => {
      const priceObj = dynamicPrices.get(key);
      const price = priceObj ? priceObj.unit_amount / 100 : fallbackPrice;
      const currencySymbol = priceObj
        ? getCurrencySymbol(priceObj.currency)
        : getCurrencySymbol(currency);
      return { price, currencySymbol };
    };

    const xsmallPrice = getPriceInfo("xsmall", 4);
    const smallPrice = getPriceInfo("small", 15);
    const mediumPrice = getPriceInfo("medium", 25);
    const largePrice = getPriceInfo("large", 90);

    // Calculate dynamic discounts based on per-credit cost (using xsmall as baseline)
    const xsmallPerCredit = xsmallPrice.price / 100;
    const smallPerCredit = smallPrice.price / 500;
    const mediumPerCredit = mediumPrice.price / 1000;
    const largePerCredit = largePrice.price / 5000;

    const smallDiscount = Math.round(
      (1 - smallPerCredit / xsmallPerCredit) * 100,
    );
    const mediumDiscount = Math.round(
      (1 - mediumPerCredit / xsmallPerCredit) * 100,
    );
    const largeDiscount = Math.round(
      (1 - largePerCredit / xsmallPerCredit) * 100,
    );

    const apiPackages: ApiPackage[] = [
      {
        id: "xsmall",
        name: t("plan.api.xsmall", "100 Credits"),
        price: xsmallPrice.price,
        currency: xsmallPrice.currencySymbol,
        credits: 100,
        description: `${xsmallPrice.currencySymbol}${(xsmallPrice.price / 100).toFixed(3)} per credit`,
      },
      {
        id: "small",
        name: t("plan.api.small", "500 Credits"),
        price: smallPrice.price,
        currency: smallPrice.currencySymbol,
        credits: 500,
        description: `${smallPrice.currencySymbol}${(smallPrice.price / 500).toFixed(3)} per credit${smallDiscount > 0 ? ` • ${smallDiscount}% discount` : ""}`,
      },
      {
        id: "medium",
        name: t("plan.api.medium", "1,000 Credits"),
        price: mediumPrice.price,
        currency: mediumPrice.currencySymbol,
        credits: 1000,
        description: `${mediumPrice.currencySymbol}${(mediumPrice.price / 1000).toFixed(3)} per credit${mediumDiscount > 0 ? ` • ${mediumDiscount}% discount` : ""}`,
      },
      {
        id: "large",
        name: t("plan.api.large", "5,000 Credits"),
        price: largePrice.price,
        currency: largePrice.currencySymbol,
        credits: 5000,
        description: `${largePrice.currencySymbol}${(largePrice.price / 5000).toFixed(3)} per credit${largeDiscount > 0 ? ` • ${largeDiscount}% discount` : ""}`,
      },
    ];

    const plansMap = new Map(plans.map((plan) => [plan.id, plan]));
    return { plans: plansMap, apiPackages };
  }, [t, dynamicPrices]);

  // Create final data object with current plan info
  const data = useMemo<PlansData | null>(() => {
    if (!staticPlansData) return null;

    const currentPlan = staticPlansData.plans.get(currentPlanId);
    if (!currentPlan) return null;

    return {
      plans: staticPlansData.plans,
      apiPackages: staticPlansData.apiPackages,
      currentPlan,
      nextBillingDate: "Feb 15, 2025",
      activeSince: "January 2025",
    };
  }, [staticPlansData, currentPlanId]);

  // Update currentPlanId when isPro changes
  useEffect(() => {
    if (isPro !== null) {
      setCurrentPlanId(isPro ? "pro" : "free");
    }
  }, [isPro]);

  // Initial load - fetch pricing data
  useEffect(() => {
    fetchPricing();
  }, [currency]); // Re-fetch when currency changes

  const updateCurrentPlan = (newPlanId: string) => {
    setCurrentPlanId(newPlanId);
  };

  return {
    data,
    plans: data ? Array.from(data.plans.values()) : [], // Convert Map to array for compatibility with proprietary code
    loading,
    error,
    refetch: refreshProStatus, // Refetch pro status from auth context
    updateCurrentPlan, // Add local plan update function
  };
};
