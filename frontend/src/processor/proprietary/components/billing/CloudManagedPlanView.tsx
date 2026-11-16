import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Banner, Button } from "@editor/ui";
import { Icon } from "@editor/ui/Icon";
import { BillingScreen } from "@editor/billing";
import type { ServerPlan } from "@editor/billing/serverPlan";
import type { Wallet } from "@editor/billing/types";
import { fetchCloudPlan, type CloudPlan } from "@processor/api/link";
import { useApplyLinkFacts } from "@processor/contexts/LinkContext";
import { qk } from "@processor/queries/keys";
import { useFleetStats } from "@processor/queries/infrastructure";
import {
  CLOUD_TEAM_PATH,
  cloudUrl,
} from "@processor/components/account-link/cloudLinks";
import { useAccountLinkOptional } from "@processor/contexts/AccountLinkContext";
import { AccountConnectionNotice } from "@processor/components/account-link/AccountConnectionNotice";

/**
 * The cached plan in the shape the shared screen reads. Money is left unknown: the server is told
 * credits, never prices, so the rows quote allowances and credit limits instead of amounts.
 */
function cloudWallet(plan: CloudPlan, usersInUse: number | null): Wallet {
  const none = { api: 0, ai: 0, automation: 0 };
  const start = plan.periodStart ?? "";
  const end = plan.periodEnd ?? "";
  return {
    teamId: null,
    status: plan.subscribed ? "subscribed" : "free",
    team: {
      held: plan.licensedUsers != null,
      licensedUsers: plan.licensedUsers,
      usersInUse: usersInUse ?? 0,
    },
    processor: { active: plan.subscribed },
    role: "leader",
    billingPeriodStart: start,
    billingPeriodEnd: end,
    includedPeriodStart: plan.periodStart,
    includedPeriodEnd: plan.periodEnd,
    billableUsed: plan.periodSpendUnits,
    billableLimit: plan.periodCapUnits,
    freeAllowance: plan.freeAllowanceUnits ?? 0,
    freeUserAllowance: 0,
    freeRemaining: plan.freeRemainingUnits,
    pricePerDocMinor: null,
    bundleRatePerCreditMinor: null,
    currency: null,
    estimatedBillMinor: null,
    capUsd: null,
    noCap: plan.periodCapUnits == null,
    stripeSubscriptionId: null,
    spendUnitsThisPeriod: plan.periodSpendUnits,
    categoryBreakdown: none,
    categoryDocs: none,
    docsProcessedThisPeriod: 0,
    uniquePdfsThisPeriod: 0,
    sizeMultiplierPdfsThisPeriod: 0,
    billingMode: plan.prepaidRemainingUnits > 0 ? "prepaid" : "payg",
    prepaidUnitsRemaining: plan.prepaidRemainingUnits,
    // The bundle size is not sent; what is left stands in, so the meter reads as full.
    prepaidUnitsTotal: plan.prepaidRemainingUnits,
    prepaidExpiresAt: null,
    members: [],
    recent: [],
  };
}

/**
 * Usage & Billing for a server linked with a key. Whoever runs the server may never have signed in
 * to Stirling Cloud, so this page reads only what the server already caches with its own
 * credential, and every action opens the cloud it is linked to.
 */
export function CloudManagedPlanView({
  licenseSection,
  usersInUse,
  userLimit,
  serverPlan,
  serverPlanAction,
}: {
  licenseSection?: ReactNode;
  usersInUse?: number | null;
  userLimit?: number | null;
  serverPlan?: ServerPlan;
  serverPlanAction?: ReactNode;
}) {
  const { t } = useTranslation();
  const applyLinkFacts = useApplyLinkFacts();
  const plan = useQuery({
    queryKey: qk.cloudPlan(),
    queryFn: fetchCloudPlan,
    refetchInterval: 60_000,
    retry: false,
  });
  const { data: fleetStats } = useFleetStats();
  const cloudAppUrl = useAccountLinkOptional()?.status?.cloudAppUrl;
  const data = plan.data;

  // The tier everywhere else reads from the wallet, which a key-linked server cannot load.
  useEffect(() => {
    if (data?.known) applyLinkFacts(true, data.subscribed);
  }, [applyLinkFacts, data?.known, data?.subscribed]);

  const billingUrl = cloudUrl("/settings/billing", cloudAppUrl);
  const open = (url: string | null) =>
    url ? () => window.open(url, "_blank", "noopener,noreferrer") : undefined;
  const openBilling = open(billingUrl);

  // A revoked link reports zeros, which would read as a plan that has run out.
  const usable = data?.known && data.state !== "REVOKED";
  const wallet = usable ? cloudWallet(data, usersInUse ?? null) : null;

  return (
    <BillingScreen
      wallet={wallet}
      loading={plan.isPending}
      usersInUse={usersInUse}
      userLimit={userLimit}
      serverPlan={serverPlan}
      serverPlanAction={serverPlanAction}
      pendingUnits={data?.unsyncedUnits ?? 0}
      licenseSection={licenseSection}
      editorsDeployed={fleetStats?.editorsDeployed ?? null}
      pdfsProcessed={fleetStats?.pdfsProcessed ?? null}
      unavailable={
        data && !usable
          ? t(
              "portal.billing.cloudManaged.waiting",
              "Plan details appear once this server has checked in with Stirling Cloud.",
            )
          : undefined
      }
      headerAction={
        billingUrl ? (
          <Button
            as="a"
            href={billingUrl}
            target="_blank"
            rel="noopener noreferrer"
            fat
            variant="secondary"
            rightSection={<Icon name="external-link" size={20} />}
          >
            {t(
              "portal.billing.cloudManaged.manage",
              "Manage billing in Stirling Cloud",
            )}
          </Button>
        ) : undefined
      }
      onAddCapacity={open(cloudUrl(CLOUD_TEAM_PATH, cloudAppUrl))}
      onActivateProcessor={openBilling}
      onGovernSpend={openBilling}
      onEnterpriseQuote={open(cloudUrl("/enterprise", cloudAppUrl))}
      notices={
        <>
          <AccountConnectionNotice />
          {data?.state === "OVER_LIMIT" && (
            <Banner
              tone="warning"
              title={t(
                "portal.billing.cloudManaged.limitTitle",
                "Spend limit reached",
              )}
            >
              {t(
                "portal.billing.cloudManaged.limitBody",
                "Metered processing is paused until your Stirling Cloud team raises the limit.",
              )}
            </Banner>
          )}
          {plan.isError && (
            <Banner
              tone="danger"
              title={t(
                "portal.billing.cloudManaged.loadError",
                "Couldn’t load this server’s plan",
              )}
            />
          )}
        </>
      }
    />
  );
}
