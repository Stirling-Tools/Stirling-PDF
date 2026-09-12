import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Card } from "@app/ui";
import { BillingScreen } from "@app/billing";
import type { Wallet } from "@app/billing/types";
import { fetchFreeTier, type FreeTierBalance } from "@portal/api/link";
import { fetchFleetStats } from "@portal/api/fleetStats";
import { usersBackend } from "@app/portal/usersBackend";
import { HttpError } from "@portal/api/http";
import { useUI } from "@portal/contexts/UIContext";

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
export function FreeTierPlanView() {
  const { t } = useTranslation();
  const { openLinkModal } = useUI();
  // An outcome, not a rendered message: the effect must not depend on `t`, whose identity is
  // not stable across renders.
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [seats, setSeats] = useState<Seats | null>(null);
  const [editorsDeployed, setEditorsDeployed] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchFreeTier()
      .then((balance) => {
        if (!cancelled) setLoad({ state: "ready", balance });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const denied =
          e instanceof HttpError && (e.status === 401 || e.status === 403);
        setLoad({ state: denied ? "forbidden" : "failed" });
      });
    // Both are best-effort: this page is the credit meter, and a row is dropped rather than
    // guessed at when its source cannot answer.
    usersBackend
      .fetchUsers("free")
      .then((u) => {
        if (!cancelled) {
          setSeats({ used: u.summary.seatsUsed, limit: u.summary.seatLimit });
        }
      })
      .catch(() => {});
    fetchFleetStats()
      .then((f) => {
        if (!cancelled) setEditorsDeployed(f.editorsDeployed);
      })
      .catch(() => {
        if (!cancelled) setEditorsDeployed(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const wallet =
    load.state === "ready" ? localWallet(load.balance, seats) : null;

  return (
    <BillingScreen
      wallet={wallet}
      loading={load.state === "loading"}
      selfHosted
      editorsDeployed={editorsDeployed}
      notices={
        <>
          <Banner
            tone="info"
            title={t(
              "portal.usage.freeTier.connectTitle",
              "This server has no Stirling account",
            )}
            action={
              <Button size="sm" onClick={() => openLinkModal()}>
                {t(
                  "portal.usage.freeTier.connect",
                  "Connect a Stirling account",
                )}
              </Button>
            }
          >
            {t(
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
