/**
 * SaaS "Plan" page — a read-only mirror of the team's plan and usage that
 * deep-links to the PDF Processor (portal), where billing, spend limits, and
 * plan changes are now managed. Branches its figures on the wallet's free vs
 * subscribed state; the "Manage in Usage & Billing" CTA is enabled only for
 * team leaders (members get the read-only hint).
 *
 * <p>Plan management used to live here (the wallet-driven PAYG dashboard +
 * spend-cap editor); that surface moved into the portal, so this page is
 * intentionally a thin snapshot.
 */
import React, { useCallback } from "react";
import { Alert, Center, Loader } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@app/hooks/useWallet";
import { useRenderCount } from "@app/hooks/useRenderCount";
import WorkspacePlanSnapshot from "@app/components/shared/config/WorkspacePlanSnapshot";
import { buildPlanSnapshotRows } from "@app/components/shared/config/planSnapshotRows";
import { useSourcesCount } from "@app/hooks/useSourcesCount";
import { PORTAL_USAGE_PATH } from "@app/routes/portalBasename";

interface PlanProps {
  /** Closes the settings modal before deep-linking to the portal. */
  onRequestClose?: () => void;
}

const Plan: React.FC<PlanProps> = ({ onRequestClose }) => {
  useRenderCount("Plan");
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { wallet, loading, error } = useWallet();
  const { count: sourcesCount } = useSourcesCount();

  const handleManage = useCallback(() => {
    onRequestClose?.();
    navigate(PORTAL_USAGE_PATH);
  }, [navigate, onRequestClose]);

  if (loading && !wallet) {
    return (
      <Center mih={200}>
        <Loader />
      </Center>
    );
  }

  if (error || !wallet) {
    return (
      <Alert
        color="red"
        title={t("payg.error.title", "Couldn't load your plan")}
      >
        {error ??
          t(
            "payg.error.body",
            "We couldn't reach the billing service. Refresh the page to try again.",
          )}
      </Alert>
    );
  }

  const tierLabel =
    wallet.status === "subscribed"
      ? t("plan.tier.processor", "Processor")
      : t("plan.tier.editor", "Editor");

  return (
    <WorkspacePlanSnapshot
      currentPlanLabel={t("plan.snapshot.currentPlan", "Current plan")}
      tierLabel={tierLabel}
      statusLabel={t("plan.snapshot.active", "Active")}
      rows={buildPlanSnapshotRows(wallet, t, { sourcesCount })}
      ctaLabel={t("plan.snapshot.manageCta", "Manage in Usage & Billing")}
      canManage={wallet.role === "leader"}
      onManage={handleManage}
      cannotManageHint={t(
        "plan.snapshot.readOnlyHint",
        "This is read-only, ask a workspace admin to make changes.",
      )}
    />
  );
};

export default Plan;
