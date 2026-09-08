import { StatusBadge, type StatusTone } from "@app/ui";

export type InvoiceRowState = "paid" | "current" | "failed" | "other";

const TONE: Record<InvoiceRowState, StatusTone> = {
  paid: "success",
  current: "info",
  failed: "danger",
  other: "neutral",
};

/**
 * One invoice, in the paper-trail section's grammar: when, what for, how much, what state, and the
 * door to the document itself.
 *
 * <p>The door is a real anchor rather than a scripted open, so it keeps middle-click, right-click
 * and "open in new tab", and it is omitted when Stripe has no hosted document to point at.
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
  /** What the invoice was for, e.g. "Team · 100 users". Muted beside the date. */
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
