import { useTranslation } from "react-i18next";
import { Card, Modal } from "@app/ui";

/** A clickable door-card (Card-as-button, matching ComponentCard's a11y pattern). */
function DoorCard({
  accent,
  title,
  badge,
  sub,
  ariaLabel,
  onClick,
}: {
  accent?: boolean;
  title: string;
  badge?: string;
  sub: string;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <Card
      interactive
      padding="default"
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      className={
        "portal-billing__door" + (accent ? " portal-billing__door--accent" : "")
      }
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <span className="portal-billing__door-head">
        <span className="portal-billing__door-title">{title}</span>
        {badge && <span className="portal-billing__door-badge">{badge}</span>}
      </span>
      <span className="portal-billing__door-sub">{sub}</span>
    </Card>
  );
}

/**
 * The "turn on the Processor" fork (demo D97): a free team chooses how to pay
 * before any card is entered. Two door-cards, matching the demo —
 *
 *   - Pay as you go → the metered subscription checkout (spend limit + card).
 *   - Prepay a year → the discounted bundle (calculator + one-time payment); the
 *     backend silently stands up the metered subscription off the saved card so
 *     metering resumes when the pool empties, so no spend-limit step is needed.
 *
 * Same per-PDF rate on both paths — prepay just front-loads two free months.
 */
export function ActivationChoiceModal({
  open,
  onClose,
  onChoosePayg,
  onChoosePrepay,
}: {
  open: boolean;
  onClose: () => void;
  onChoosePayg: () => void;
  onChoosePrepay: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      title={t("portal.billing.activation.title", "How do you want to pay?")}
      subtitle={t(
        "portal.billing.activation.subtitle",
        "Same per-PDF rate either way — prepaying just gets you two months free.",
      )}
    >
      <div className="portal-billing__door-grid">
        <DoorCard
          title={t("portal.billing.activation.payg.title", "Pay as you go")}
          sub={t(
            "portal.billing.activation.payg.sub",
            "Set a monthly limit and pay for what you use.",
          )}
          ariaLabel={t("portal.billing.activation.payg.title", "Pay as you go")}
          onClick={onChoosePayg}
        />
        <DoorCard
          accent
          title={t("portal.billing.activation.prepay.title", "Prepay a year")}
          badge={t("portal.billing.activation.prepay.badge", "2 months free")}
          sub={t(
            "portal.billing.activation.prepay.sub",
            "One upfront payment. Used before metered billing; unused capacity expires after 12 months.",
          )}
          ariaLabel={t(
            "portal.billing.activation.prepay.title",
            "Prepay a year",
          )}
          onClick={onChoosePrepay}
        />
      </div>
    </Modal>
  );
}
