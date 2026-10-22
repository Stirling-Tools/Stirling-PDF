import { StatusBadge, type StatusTone } from "@app/ui";

export type InvoiceRowState = "paid" | "current" | "failed" | "other";

const TONE: Record<InvoiceRowState, StatusTone> = {
  paid: "success",
  current: "info",
  failed: "danger",
  other: "neutral",
};

/**
 * One invoice row. The door is a real anchor rather than a scripted open, so middle-click,
 * right-click and "open in new tab" all still work.
 */
export function InvoiceRow({
  date,
  description,
  amount,
  state,
  stateLabel,
  href,
  viewLabel,
}: {
  date: string;
  /** What the invoice was for, e.g. "Team · 100 users". */
  description?: string | null;
  amount: string;
  state: InvoiceRowState;
  stateLabel: string;
  /** Stripe's hosted invoice page. Omit when there is none and the door drops out. */
  href?: string | null;
  viewLabel: string;
}) {
  return (
    <div className="billing-inv">
      <span className="billing-inv__date">{date}</span>
      {description ? (
        <span className="billing-inv__desc">{description}</span>
      ) : (
        <span className="billing-inv__desc" />
      )}
      <span className="billing-inv__amount">{amount}</span>
      <StatusBadge tone={TONE[state]} size="sm" showDot={false}>
        {stateLabel}
      </StatusBadge>
      {href ? (
        <a
          className="billing-inv__door"
          href={href}
          target="_blank"
          rel="noreferrer noopener"
        >
          {viewLabel}
        </a>
      ) : (
        <span className="billing-inv__door" aria-hidden />
      )}
    </div>
  );
}
