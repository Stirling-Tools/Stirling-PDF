import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@app/ui";
import { TeamPlanCard } from "@app/billing/TeamPlanCard";
import { ProcessorPlanCard } from "@app/billing/ProcessorPlanCard";
import type { Wallet } from "@app/billing/types";

export interface BillingScreenProps {
  /** Null while loading, or when the host could not read one. */
  wallet: Wallet | null;
  loading?: boolean;
  /**
   * Units a linked instance has accrued that the cloud has not billed yet. A plain number rather
   * than the host's usage record, so this screen does not depend on how any one edition models
   * local usage.
   */
  pendingUnits?: number;
  /** Leader-only: buy or change Team capacity. Omit for members and where no flow exists. */
  onBuyTeam?: () => void;
  /** Leader-only: switch the Processor on. Omit for members. */
  onActivateProcessor?: () => void;
  /** Header-level action, e.g. "Manage payment". Editions differ on whether they have one. */
  headerAction?: ReactNode;
  /** Banners above the products: a lapsed session, a failed wallet read. Host-owned. */
  notices?: ReactNode;
  /**
   * Sections appended below the two products. The host's own surfaces live here: invoices, payment
   * method, checkout modals, upsells. Anything that needs the host's router, API client or modal
   * stack belongs in this slot rather than in this component.
   */
  extras?: ReactNode;
}

/**
 * The billing screen. One view for every edition, so that what a customer is paying for is
 * described the same way whether they are on the cloud, self-hosting, or on the desktop app.
 *
 * <p>It is structured around the two products rather than around a plan tier, because that is what
 * the wallet now reports: Team covers users, the Processor covers processing, and a team may hold
 * either, both, or neither. A tier cannot express that, which is why the surfaces this replaces
 * each had to branch on {@code wallet.status} and could only ever describe one product properly.
 *
 * <p>Edition differences are seams, not forks. Data loading, actions and edition-specific sections
 * arrive as props and slots, so a host supplies what it has and omits what it does not: a member
 * passes no action callbacks and gets a read-only screen; an edition with no purchase flow passes
 * none and the cards stay informational. Nothing here reaches for a router, an API client or a
 * modal stack, which is what lets the same component render in all of them.
 *
 * <p>The class names are the host's contract, the same arrangement {@link MeterBar} already uses:
 * this component emits them and each host's stylesheet supplies them. That keeps a single markup
 * definition without forcing every edition onto one stylesheet on day one.
 */
export function BillingScreen({
  wallet,
  loading = false,
  pendingUnits = 0,
  onBuyTeam,
  onActivateProcessor,
  headerAction,
  notices,
  extras,
}: BillingScreenProps) {
  const { t } = useTranslation();

  return (
    <div className="portal-usage portal-billing">
      <header className="portal-usage__header">
        <div className="portal-usage__header-inner">
          <div>
            <h1 className="portal-usage__title">
              {t("portal.usage.title", "Usage & billing")}
            </h1>
            <p className="portal-usage__subtitle">
              {t(
                "portal.usage.subtitle",
                "Consumption, invoices, and plan management for every PDF Stirling has billed, in one console.",
              )}
            </p>
          </div>
          {headerAction}
        </div>
      </header>

      <div className="portal-usage__body">
        {loading && (
          <div className="portal-billing__skeleton" aria-hidden>
            <Skeleton height="10rem" />
            <Skeleton height="14rem" />
          </div>
        )}

        {notices}

        {/* The two products, each from its own reported holding. Version skew is real for a linked
            instance reading a cloud wallet, so a build older than the holdings skips the card
            rather than crashing on it. */}
        {wallet?.team && <TeamPlanCard wallet={wallet} onBuy={onBuyTeam} />}
        {wallet?.processor && (
          <ProcessorPlanCard
            wallet={wallet}
            pendingUnits={pendingUnits}
            onActivate={onActivateProcessor}
          />
        )}

        {extras}
      </div>
    </div>
  );
}
