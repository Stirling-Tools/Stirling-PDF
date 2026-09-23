import type { ReactNode } from "react";
import type { ServerPlan } from "@app/billing/serverPlan";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@app/auth";
import { qk } from "@portal/queries/keys";
import { useTranslation } from "react-i18next";
import { Banner, Button, Card } from "@app/ui";
import { BillingScreen } from "@app/billing";
import type { Wallet } from "@app/billing/types";
import { fetchFreeTier, type FreeTierBalance } from "@portal/api/link";
import { useFleetStats } from "@portal/queries/infrastructure";
import { usersBackend } from "@app/portal/usersBackend";
import { HttpError } from "@portal/api/http";
import { useUI } from "@portal/contexts/UIContext";
import "@portal/components/billing/FreeTierPlanView.css";

/** {@code forbidden} is an outcome, not a failure: the endpoint is admin-only. */
type Load =
  | { state: "loading" }
  | { state: "ready"; balance: FreeTierBalance }
  | { state: "forbidden" }
  | { state: "failed" };

interface Seats {
  used: number;
  /** The ceiling the server enforces; null when it is unlimited or unreadable. */
  limit: number | null;
}

/**
 * The local ledger in the shape the shared screen reads.
 *
 * <p>Every field is either a fact this server knows or a deliberate zero: an unlinked instance has
 * bought nothing, so there is no rate, no invoice and no Stripe anything. {@code pricePerDocMinor}
 * stays null rather than guessing, which is what makes the Processor row quote an allowance
 * instead of a price.
 */
function localWallet(balance: FreeTierBalance, seats: Seats | null): Wallet {
  const none = { api: 0, ai: 0, automation: 0 };
  return {
    teamId: null,
    status: "free",
    team: { held: false, licensedUsers: null, usersInUse: seats?.used ?? 0 },
    processor: { active: false },
    role: "leader",
    billingPeriodStart: balance.periodStart,
    billingPeriodEnd: balance.periodEnd,
    billableUsed: balance.usedUnits,
    billableLimit: balance.grantUnits,
    freeAllowance: balance.grantUnits,
    freeUserAllowance: seats?.limit ?? 0,
    freeRemaining: balance.remainingUnits,
    pricePerDocMinor: null,
    bundleRatePerCreditMinor: null,
    currency: null,
    estimatedBillMinor: null,
    capUsd: null,
    noCap: false,
    stripeSubscriptionId: null,
    spendUnitsThisPeriod: balance.usedUnits,
    categoryBreakdown: none,
    categoryDocs: none,
    docsProcessedThisPeriod: 0,
    uniquePdfsThisPeriod: 0,
    sizeMultiplierPdfsThisPeriod: 0,
    billingMode: "payg",
    prepaidUnitsRemaining: 0,
    prepaidUnitsTotal: 0,
    prepaidExpiresAt: null,
    members: [],
    recent: [],
  };
}

/**
 * Usage and billing for an instance with no Stirling account: the same screen a linked team sees,
 * fed from the local ledger, with connecting offered as the way to get more.
 *
 * <p>Reads local endpoints only. Loading a wallet here would assert a linkage the browser's SaaS
 * session cannot vouch for.
 */
export function FreeTierPlanView({
  licenseSection,
  serverPlan,
  serverPlanAction,
}: {
  licenseSection?: ReactNode;
  serverPlan?: ServerPlan;
  serverPlanAction?: ReactNode;
}) {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const { openLinkModal } = useUI();
  const query = useQuery({
    queryKey: qk.freeTier(),
    queryFn: fetchFreeTier,
    enabled: isAdmin,
    refetchInterval: 60_000,
    retry: false,
  });
  let load: Load = { state: "loading" };
  if (!isAdmin) load = { state: "forbidden" };
  else if (query.data) load = { state: "ready", balance: query.data };
  else if (query.isError) {
    const denied =
      query.error instanceof HttpError &&
      (query.error.status === 401 || query.error.status === 403);
    load = { state: denied ? "forbidden" : "failed" };
  }
  const [seats, setSeats] = useState<Seats | null>(null);
  const { data: fleetStats } = useFleetStats();
  const editorsDeployed = fleetStats?.editorsDeployed ?? null;

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    // User counts are best-effort: this page is the credit meter, and a row is dropped rather than
    // guessed at when its source cannot answer.
    usersBackend
      .fetchUsers("free")
      .then((u) => {
        if (!cancelled) {
          setSeats({ used: u.summary.seatsUsed, limit: u.summary.seatLimit });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const wallet =
    load.state === "ready" ? localWallet(load.balance, seats) : null;
  const exhausted =
    serverPlan?.licenseType !== "ENTERPRISE" &&
    load.state === "ready" &&
    load.balance.remainingUnits === 0;
  const onLink = isAdmin
    ? () => openLinkModal(exhausted ? "exhausted" : "link")
    : undefined;

  return (
    <BillingScreen
      wallet={wallet}
      loading={load.state === "loading"}
      selfHosted
      licenseSection={licenseSection}
      serverPlan={serverPlan}
      serverPlanAction={serverPlanAction}
      editorsDeployed={editorsDeployed}
      pdfsProcessed={fleetStats?.pdfsProcessed ?? null}
      onAddCapacity={onLink}
      onActivateProcessor={onLink}
      notices={
        <>
          <Banner
            className="billing-connect"
            tone="info"
            title={t(
              "portal.usage.freeTier.connectTitle",
              "This server has no Stirling account",
            )}
            action={
              isAdmin ? (
                <Button size="sm" onClick={onLink}>
                  {exhausted
                    ? t(
                        "portal.accountLink.rail.exhaustedCta",
                        "Link account for more credits",
                      )
                    : t(
                        "portal.usage.freeTier.connect",
                        "Connect a Stirling account",
                      )}
                </Button>
              ) : undefined
            }
          >
            {serverPlan?.licenseType === "ENTERPRISE"
              ? t(
                  "portal.billing.serverPlan.enterpriseConnectBody",
                  "Your Enterprise license includes processing on this server. Connecting an account is optional.",
                )
              : serverPlan
                ? t(
                    "portal.billing.serverPlan.connectBody",
                    "Connect to add cloud processing credits. Your server license stays active.",
                  )
                : t(
                    "portal.usage.freeTier.connectBody",
                    "Connecting adds a second monthly allowance, raises the users this server can have, and turns on the Processor.",
                  )}
          </Banner>

          {load.state === "failed" && (
            <Banner
              tone="danger"
              title={t(
                "portal.usage.freeTier.loadErrorTitle",
                "Couldn't load credit usage",
              )}
            >
              {t(
                "portal.usage.freeTier.loadError",
                "Couldn't read this server's credit usage. Try again in a moment.",
              )}
            </Banner>
          )}
        </>
      }
      extras={
        load.state === "forbidden" ? (
          <Card padding="loose">
            <p className="portal-billing__section-sub">
              {t(
                "portal.usage.freeTier.adminOnly",
                "This server's monthly credits are shared by everyone on it, so only an administrator can see the figures. Everything you can run stays available.",
              )}
            </p>
          </Card>
        ) : undefined
      }
    />
  );
}
