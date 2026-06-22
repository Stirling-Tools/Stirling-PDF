import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Skeleton, StatusBadge } from "@shared/components";
import { useTier } from "@portal/contexts/TierContext";
import { useAsync } from "@portal/hooks/useAsync";
import {
  fetchBillingSummary,
  fetchPlanOptions,
  type BillingSummary,
  type PlanOption,
} from "@portal/api/usage";
import { UsageChart } from "@portal/components/usage/UsageChart";
import { BillingKpiStrip } from "@portal/components/usage/BillingKpiStrip";
import { CurrentPlanCard } from "@portal/components/usage/CurrentPlanCard";
import { SpendCapControl } from "@portal/components/usage/SpendCapControl";
import { AvailablePlans } from "@portal/components/usage/AvailablePlans";
import { BillingHistoryTable } from "@portal/components/usage/BillingHistoryTable";
import { UpgradeModal } from "@portal/components/usage/UpgradeModal";
import "@portal/views/Usage.css";

export function Usage() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTarget, setModalTarget] = useState<PlanOption | null>(null);

  const summaryState = useAsync<BillingSummary>(
    () => fetchBillingSummary(tier),
    [tier],
  );
  const summary = summaryState.loading ? null : summaryState.data;

  const plansState = useAsync<PlanOption[]>(() => fetchPlanOptions(), []);
  const { data: plans } = plansState;

  function openUpgrade(target: PlanOption | null) {
    setModalTarget(target);
    setModalOpen(true);
  }

  return (
    <div className="portal-usage">
      <header className="portal-usage__header">
        <div>
          <h1 className="portal-usage__title">{t("usage.title")}</h1>
          <p className="portal-usage__subtitle">{t("usage.subtitle")}</p>
        </div>
        <StatusBadge
          tone={
            tier === "enterprise"
              ? "purple"
              : tier === "pro"
                ? "info"
                : "neutral"
          }
          size="md"
        >
          {summary?.planName ?? "—"}
        </StatusBadge>
      </header>

      <UsageChart />

      <BillingKpiStrip summary={summary} />

      <div className="portal-usage__row">
        {summary ? (
          <CurrentPlanCard
            summary={summary}
            onUpgrade={() => openUpgrade(null)}
          />
        ) : (
          <Card padding="loose">
            <Skeleton width="10rem" height="1.25rem" />
            <Skeleton height="9rem" />
          </Card>
        )}
        {summary ? (
          <SpendCapControl summary={summary} />
        ) : (
          <Card padding="loose">
            <Skeleton width="8rem" height="1.25rem" />
            <Skeleton height="5rem" />
          </Card>
        )}
      </div>

      {plans && plans.length > 0 && (
        // Any plan selection routes through the intent-aware upgrade modal; the
        // target plan drives whether the copy is an upgrade pitch or a
        // downgrade / sales conversation.
        <AvailablePlans plans={plans} current={tier} onSelect={openUpgrade} />
      )}

      <BillingHistoryTable />

      <UpgradeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        currentTier={tier}
        target={modalTarget}
      />
    </div>
  );
}
