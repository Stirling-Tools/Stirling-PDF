import { Card } from "@shared/components";
import AllInclusiveIcon from "@mui/icons-material/AllInclusiveRounded";
import BoltIcon from "@mui/icons-material/BoltRounded";
import { formatPeriodDate } from "@shared/billing";
import type { Wallet } from "@portal/api/billing";
import { SubscribedMeter } from "@portal/components/billing/WalletMeter";

interface Props {
  wallet: Wallet;
}

/**
 * Top "plan header" card — the free-vs-metered split, ported from the SaaS
 * cloud Payg.tsx planhead. Left column: the always-free Editor plan. Right
 * column: the metered Processor plan. The eyebrow shows the plan name + (when
 * subscribed) the current billing period.
 */
export function PlanHeadCard({ wallet }: Props) {
  const subscribed = wallet.status === "subscribed";
  const isLeader = wallet.role === "leader";

  const eyebrow = subscribed
    ? `Processor plan · ${formatPeriodDate(wallet.billingPeriodStart)} – ${formatPeriodDate(wallet.billingPeriodEnd)}`
    : "Editor plan";

  return (
    <Card padding="loose" className="portal-billing__planhead">
      <div className="portal-billing__planhead-top">
        <span className="portal-billing__planhead-eyebrow">{eyebrow}</span>
        <span className="portal-billing__role-pill" data-leader={isLeader}>
          {isLeader ? "Team owner" : "Member"}
        </span>
      </div>

      <div className="portal-billing__planhead-split">
        <div className="portal-billing__planhead-col">
          <div className="portal-billing__planhead-lbl portal-billing__planhead-lbl--free">
            <AllInclusiveIcon sx={{ fontSize: 16 }} />
            Always free
          </div>
          <p className="portal-billing__planhead-title">Unlimited PDF editing</p>
          <p className="portal-billing__planhead-body">
            View, edit, merge, split, sign, watermark, compress, convert and
            manual OCR, as much as you want, no matter where you trigger it.
          </p>
        </div>

        <div className="portal-billing__planhead-col portal-billing__planhead-col--meter">
          <div className="portal-billing__planhead-lbl portal-billing__planhead-lbl--meter">
            <BoltIcon sx={{ fontSize: 16 }} />
            Metered
          </div>
          <p className="portal-billing__planhead-title">Automation · AI · API</p>
          <p className="portal-billing__planhead-body">
            {wallet.freeAllowance.toLocaleString()} free PDFs to start, then
            billed per PDF up to your cap.
          </p>
        </div>
      </div>

      {subscribed && (
        <div className="portal-billing__planhead-meter">
          <span className="portal-billing__eyebrow">This period</span>
          <SubscribedMeter wallet={wallet} />
        </div>
      )}
    </Card>
  );
}
