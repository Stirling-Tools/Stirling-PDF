import { useCallback, useState } from "react";
import {
  Banner,
  Button,
  Card,
  StatusBadge,
  Table,
  type TableColumn,
} from "@shared/components";
import type { Wallet, WalletMember } from "@portal/api/billing";
import { createPortalSession } from "@portal/billing/stripe";
import { WalletMeter } from "@portal/components/billing/WalletMeter";
import { CategoryBreakdownPanel } from "@portal/components/billing/CategoryBreakdownPanel";
import { CapControl } from "@portal/components/billing/CapControl";
import { InvoicesList } from "@portal/components/billing/InvoicesList";

interface Props {
  wallet: Wallet;
  onWalletChange?: () => void;
}

/**
 * Linked + subscribed. The full PAYG dashboard:
 *   - period meter + estimated bill
 *   - by-category breakdown (real data from wallet.categoryBreakdown)
 *   - monthly cap (leader-only edit, real PATCH /api/v1/payg/cap)
 *   - team members + per-member spend (leader only)
 *   - invoices (real GET /api/v1/payg/invoices)
 *   - "Manage subscription" → Stripe customer portal
 */
export function SubscribedPlanView({ wallet, onWalletChange }: Props) {
  const [portalError, setPortalError] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);

  const openPortal = useCallback(async () => {
    if (wallet.teamId == null) return;
    setOpeningPortal(true);
    setPortalError(null);
    try {
      const url = await createPortalSession({
        teamId: wallet.teamId,
        returnUrl: window.location.href,
      });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setPortalError(e instanceof Error ? e.message : String(e));
    } finally {
      setOpeningPortal(false);
    }
  }, [wallet.teamId]);

  const memberColumns: TableColumn<WalletMember>[] = [
    {
      key: "name",
      header: "Member",
      render: (m) => (
        <div className="portal-billing__member-stack">
          <span className="portal-billing__member-name">{m.name || m.email}</span>
          <span className="portal-billing__member-email">{m.email}</span>
        </div>
      ),
    },
    {
      key: "spend",
      header: "PDFs this period",
      align: "right",
      render: (m) => m.spendUnits.toLocaleString(),
    },
  ];

  return (
    <div className="portal-billing__stack">
      <WalletMeter wallet={wallet} />

      <div className="portal-billing__row">
        <CapControl wallet={wallet} onSaved={onWalletChange} />
        <CategoryBreakdownPanel
          breakdown={wallet.categoryBreakdown}
          totalSpend={wallet.spendUnitsThisPeriod}
        />
      </div>

      {wallet.role === "leader" && wallet.members.length > 0 && (
        <Card padding="loose">
          <h3 className="portal-billing__section-title">Per-member usage</h3>
          <Table
            className="portal-billing__flush-table"
            columns={memberColumns}
            rows={wallet.members}
            rowKey={(m) => m.userId}
          />
        </Card>
      )}

      <Card padding="loose">
        <span className="portal-billing__eyebrow">Subscription</span>
        <h3 className="portal-billing__section-title">Manage your subscription</h3>
        <p className="portal-billing__section-sub">
          Update your card, download invoices, change billing email, or cancel
          your subscription in Stripe's hosted portal.
        </p>
        {portalError && (
          <Banner tone="danger" title="Couldn't open Stripe portal">
            {portalError}
          </Banner>
        )}
        <div className="portal-billing__row-actions">
          <Button
            variant="outline"
            loading={openingPortal}
            onClick={openPortal}
            disabled={wallet.teamId == null}
          >
            Open Stripe portal ↗
          </Button>
          <StatusBadge tone="success" size="sm">
            Active
          </StatusBadge>
        </div>
      </Card>

      <InvoicesList />
    </div>
  );
}
