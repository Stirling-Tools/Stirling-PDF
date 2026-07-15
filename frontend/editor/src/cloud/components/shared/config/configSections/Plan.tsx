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
import { formatMinor, formatMoneyMajor, formatPeriodDate } from "@app/billing";
import WorkspacePlanSnapshot, {
  type WorkspacePlanSnapshotRow,
} from "@app/components/shared/config/WorkspacePlanSnapshot";
import { PORTAL_USAGE_PATH } from "@app/routes/portalBasename";
import type { Wallet } from "@app/hooks/useWallet";
import type { TFunction } from "i18next";

interface PlanProps {
  /** Closes the settings modal before deep-linking to the portal. */
  onRequestClose?: () => void;
}

/** Build the four snapshot figures from the wallet, branching on plan state. */
function buildRows(wallet: Wallet, t: TFunction): WorkspacePlanSnapshotRow[] {
  const currency = wallet.currency;
  const rate =
    wallet.pricePerDocMinor != null
      ? t("plan.snapshot.perPdf", "{{amount}} / PDF", {
          amount: formatMinor(wallet.pricePerDocMinor, currency),
        })
      : "—";

  if (wallet.status === "subscribed") {
    return [
      {
        label: t("plan.snapshot.documentsPeriod", "Documents this period"),
        value: wallet.billableUsed.toLocaleString(),
        sub: t("plan.snapshot.thisBillingPeriod", "This billing period"),
      },
      {
        label: t("plan.snapshot.spendPeriod", "Spend this period"),
        value:
          wallet.estimatedBillMinor != null
            ? formatMinor(wallet.estimatedBillMinor, currency)
            : "—",
        sub:
          wallet.capUsd != null
            ? t("plan.snapshot.ofLimit", "of {{cap}} limit", {
                cap: formatMoneyMajor(wallet.capUsd, currency),
              })
            : t("plan.snapshot.noSpendLimit", "No spend limit"),
      },
      {
        label: t("plan.snapshot.perPdfRate", "Per-PDF rate"),
        value: rate,
        sub: t("plan.snapshot.scales", "Scales with size + policies"),
      },
      {
        label: t("plan.snapshot.renews", "Renews"),
        value: formatPeriodDate(wallet.billingPeriodEnd),
      },
    ];
  }

  // Free tier.
  return [
    {
      label: t("plan.snapshot.documentsMonth", "Documents this month"),
      value:
        wallet.billableLimit != null
          ? `${wallet.billableUsed.toLocaleString()} / ${wallet.billableLimit.toLocaleString()}`
          : wallet.billableUsed.toLocaleString(),
      sub: t("plan.snapshot.hardCapFree", "Hard cap on Free"),
    },
    {
      label: t("plan.snapshot.spendMonth", "Spend this month"),
      value: formatMinor(wallet.estimatedBillMinor ?? 0, wallet.currency),
      sub: t("plan.snapshot.noCardOnFile", "No card on file"),
    },
    {
      label: t("plan.snapshot.startingRate", "Starting rate"),
      value: rate,
      sub: t("plan.snapshot.firstFree", "first {{count}} free", {
        count: wallet.freeAllowance,
      }),
    },
    {
      label: t("plan.snapshot.freeRemaining", "Free remaining"),
      value: wallet.freeRemaining.toLocaleString(),
      sub: t("plan.snapshot.ofAllowance", "of {{count}}", {
        count: wallet.freeAllowance,
      }),
    },
  ];
}

const Plan: React.FC<PlanProps> = ({ onRequestClose }) => {
  useRenderCount("Plan");
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { wallet, loading, error } = useWallet();

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
      bannerTitle={t("plan.snapshot.readOnly.title", "Read-only snapshot")}
      bannerMessage={t(
        "plan.snapshot.readOnly.body",
        "Plan and usage are governed in the PDF Processor. This mirrors the workspace's current state.",
      )}
      currentPlanLabel={t("plan.snapshot.currentPlan", "Current plan")}
      tierLabel={tierLabel}
      statusLabel={t("plan.snapshot.active", "Active")}
      rows={buildRows(wallet, t)}
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
