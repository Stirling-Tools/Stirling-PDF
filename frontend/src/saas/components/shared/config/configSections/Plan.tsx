import React, { useState, useCallback, useEffect } from "react";
import { Divider, Loader, Alert, Select, Group, Text } from "@mantine/core";
import { usePlans, PlanTier } from "@app/hooks/usePlans";
import StripeCheckout, {
  PurchaseType,
  CreditsPack,
  PlanID,
} from "@app/components/shared/StripeCheckoutSaas";
import AvailablePlansSection from "@app/components/shared/config/configSections/plan/AvailablePlansSection";
import ApiPackagesSection from "@app/components/shared/config/configSections/plan/ApiPackagesSection";
import ActivePlanSection from "@app/components/shared/config/configSections/plan/ActivePlanSection";
import { useAuth } from "@app/auth/UseSession";

const Plan: React.FC = () => {
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanTier | null>(null);
  const [selectedCredits, setSelectedCredits] = useState(0); // Index of selected credit package
  const [purchaseType, setPurchaseType] =
    useState<PurchaseType>("subscription");
  const [selectedCreditsPack, setSelectedCreditsPack] =
    useState<CreditsPack>(null);
  const [currency, setCurrency] = useState<string>("gbp");
  const { trialStatus } = useAuth();
  const { data, loading, error, updateCurrentPlan } = usePlans(currency);

  const currencyOptions = [
    { value: "cny", label: "Chinese yuan (CNY, ¥)" },
    { value: "usd", label: "US dollar (USD, $)" },
    { value: "inr", label: "Indian rupee (INR, ₹)" },
    { value: "brl", label: "Brazilian real (BRL, R$)" },
    { value: "eur", label: "Euro (EUR, €)" },
    { value: "idr", label: "Indonesian rupiah (IDR, Rp)" },
    { value: "gbp", label: "British pound (GBP, £)" },
  ];

  const handleUpgradeClick = useCallback(
    (plan: PlanTier) => {
      if (!data) return;

      if (plan.isContactOnly) {
        // Open contact form or redirect to contact page
        window.open(
          "mailto:contact@stirlingpdf.com?subject=Enterprise Plan Inquiry",
          "_blank",
        );
        return;
      }

      if (plan.id !== data.currentPlan.id) {
        setSelectedPlan(plan);
        setPurchaseType("subscription");
        setSelectedCreditsPack(null);
        setCheckoutOpen(true);
      }
    },
    [data],
  );

  const handleCreditPurchaseClick = useCallback(
    (creditsPack: CreditsPack) => {
      if (!data) return;

      setSelectedCreditsPack(creditsPack);
      setPurchaseType("credits");
      setSelectedPlan(null);
      setCheckoutOpen(true);
    },
    [data],
  );

  const handlePaymentSuccess = useCallback(
    (sessionId: string) => {
      console.log("Payment successful, session:", sessionId);

      // Update local state immediately - no page reload needed
      if (selectedPlan && purchaseType === "subscription") {
        updateCurrentPlan(selectedPlan.id);
      }

      // Close modal after brief delay to show success message
      setTimeout(() => {
        setCheckoutOpen(false);
        setSelectedPlan(null);
        setSelectedCreditsPack(null);
      }, 2000);
    },
    [selectedPlan, purchaseType, updateCurrentPlan],
  );

  const handlePaymentError = useCallback((error: string) => {
    console.error("Payment error:", error);
    // Error is already displayed in the StripeCheckout component
  }, []);

  const handleCheckoutClose = useCallback(() => {
    setCheckoutOpen(false);
    setSelectedPlan(null);
    setSelectedCreditsPack(null);
  }, []);

  const handleAddPaymentClick = useCallback(() => {
    if (!data) return;

    // Find Pro plan from available plans
    const proPlan = Array.from(data.plans.values()).find(
      (plan) => plan.id === "pro",
    );

    if (proPlan) {
      setSelectedPlan(proPlan);
      setPurchaseType("subscription");
      setSelectedCreditsPack(null);
      setCheckoutOpen(true);
    }
  }, [data]);

  // Check URL parameters for action=add-payment
  useEffect(() => {
    if (!data) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("action") === "add-payment") {
      handleAddPaymentClick();
      // Clean up URL
      params.delete("action");
      const newUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, "", newUrl);
    }
  }, [data, handleAddPaymentClick]);

  // Early returns after all hooks are called
  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert color="red" title="Error loading plans">
        {error}
      </Alert>
    );
  }

  if (!data) {
    return (
      <Alert color="yellow" title="No data available">
        Plans data is not available at the moment.
      </Alert>
    );
  }

  const { plans, apiPackages, currentPlan, nextBillingDate, activeSince } =
    data;
  const plansArray = Array.from(plans.values());

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Currency Selector */}
      <div>
        <Group justify="space-between" align="center" mb="md">
          <Text size="lg" fw={600}>
            Currency
          </Text>
          <Select
            value={currency}
            onChange={(value) => setCurrency(value || "gbp")}
            data={currencyOptions}
            searchable
            clearable={true}
            w={300}
          />
        </Group>
      </div>

      <ActivePlanSection
        currentPlan={currentPlan}
        _activeSince={activeSince}
        _nextBillingDate={nextBillingDate}
        trialStatus={trialStatus ?? undefined}
        onAddPaymentClick={handleAddPaymentClick}
      />

      <Divider />

      <AvailablePlansSection
        plans={plansArray}
        currentPlan={currentPlan}
        onUpgradeClick={handleUpgradeClick}
      />

      <Divider />

      <ApiPackagesSection
        apiPackages={apiPackages}
        selectedCredits={selectedCredits}
        onSelectedCreditsChange={setSelectedCredits}
        onCreditPurchaseClick={handleCreditPurchaseClick}
      />

      {/* Stripe Checkout Modal */}
      <StripeCheckout
        opened={
          checkoutOpen &&
          (selectedPlan !== null || selectedCreditsPack !== null)
        }
        onClose={handleCheckoutClose}
        purchaseType={purchaseType}
        planId={
          purchaseType === "subscription" ? (selectedPlan?.id as PlanID) : null
        }
        creditsPack={purchaseType === "credits" ? selectedCreditsPack : null}
        planName={
          purchaseType === "subscription"
            ? selectedPlan?.name || ""
            : data?.apiPackages.find((pkg) => pkg.id === selectedCreditsPack)
                ?.name || ""
        }
        onSuccess={handlePaymentSuccess}
        onError={handlePaymentError}
        isTrialConversion={
          trialStatus?.isTrialing && purchaseType === "subscription"
        }
      />
    </div>
  );
};

export default Plan;
