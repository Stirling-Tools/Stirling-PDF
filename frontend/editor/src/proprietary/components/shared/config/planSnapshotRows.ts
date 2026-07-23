import type { TFunction } from "i18next";
import { formatMinor, formatMoneyMajor } from "@app/billing";
import type { Wallet } from "@app/billing";
import type { WorkspacePlanSnapshotRow } from "@app/components/shared/config/WorkspacePlanSnapshot";

/**
 * Audit-log retention on the Processor plan. This is a plan attribute, not a
 * wallet field, so it lives here as a constant rather than being fetched from
 * the (Enterprise-gated) audit-dashboard endpoint.
 */
export const PROCESSOR_AUDIT_RETENTION_DAYS = 7;

export interface PlanSnapshotExtras {
  /** Connected sources (policy/pipeline inputs) count; null while loading/unknown. */
  sourcesCount: number | null;
}

/**
 * The four plan/usage figures for the "Plan & Usage" card, branched on the
 * wallet's free vs subscribed state. Shared by the SaaS and self-hosted pages
 * so both render an identical card from the same wallet contract.
 *
 * <p>Free (Editor): Documents (used / grant) · Spend · Starting rate · Sources.
 * Subscribed (Processor): Documents · Spend · Starting rate · Audit retention.
 */
export function buildPlanSnapshotRows(
  wallet: Wallet,
  t: TFunction,
  { sourcesCount }: PlanSnapshotExtras,
): WorkspacePlanSnapshotRow[] {
  const currency = wallet.currency;
  const rate =
    wallet.pricePerDocMinor != null
      ? t("plan.snapshot.perPdf", "{{amount}} / PDF", {
          amount: formatMinor(wallet.pricePerDocMinor, currency),
        })
      : "—";

  if (wallet.status === "subscribed") {
    const spendSub =
      wallet.capUsd != null && wallet.capUsd > 0
        ? t("plan.snapshot.pctOfLimit", "{{pct}}% of {{cap}} limit", {
            pct: Math.round((wallet.estimatedBillMinor ?? 0) / wallet.capUsd),
            cap: formatMoneyMajor(wallet.capUsd, currency),
          })
        : t("plan.snapshot.noSpendLimit", "No spend limit");
    return [
      {
        label: t("plan.snapshot.documentsMonth", "Documents this month"),
        value: wallet.billableUsed.toLocaleString(),
        sub: t(
          "plan.snapshot.documentsMetered",
          "From {{rate}} · scales with size + policies",
          { rate },
        ),
      },
      {
        label: t("plan.snapshot.spendMonth", "Spend this month"),
        value:
          wallet.estimatedBillMinor != null
            ? formatMinor(wallet.estimatedBillMinor, currency)
            : "—",
        sub: spendSub,
      },
      {
        label: t("plan.snapshot.startingRate", "Starting rate"),
        value: rate,
        sub: t(
          "plan.snapshot.floorScales",
          "Floor; scales with size + policies",
        ),
      },
      {
        label: t("plan.snapshot.auditRetention", "Audit retention"),
        value: t("plan.snapshot.retentionDays", "{{count}} days", {
          count: PROCESSOR_AUDIT_RETENTION_DAYS,
        }),
      },
    ];
  }

  // Free (Editor)
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
      value: formatMinor(wallet.estimatedBillMinor ?? 0, currency),
      sub: t("plan.snapshot.noCardOnFile", "No card on file"),
    },
    {
      label: t("plan.snapshot.startingRate", "Starting rate"),
      value: rate,
      sub: t(
        "plan.snapshot.startingRateFree",
        "From here, scales with file size and policies · first {{count}} free",
        { count: wallet.freeAllowance },
      ),
    },
    {
      label: t("plan.snapshot.sources", "Sources"),
      value: sourcesCount != null ? sourcesCount.toLocaleString() : "—",
      sub: t("plan.snapshot.sourcesSub", "Connected for policies + pipelines"),
    },
  ];
}
