import { useTranslation } from "react-i18next";
import { Button, Card, Modal } from "@app/ui";
import { PrepayModalHeader } from "@portal/components/billing/PrepayModalHeader";

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
      width="md"
      className="portal-billing__bundle-modal"
      ariaLabel={t(
        "portal.billing.activation.title",
        "Switch on the Processor",
      )}
    >
      <PrepayModalHeader
        step={1}
        title={t("portal.billing.activation.title", "Switch on the Processor")}
        onClose={onClose}
      />
      <div className="portal-billing__door-grid">
        <DoorCard
          title={t("portal.billing.activation.payg.title", "Pay as you go")}
          sub={t(
            "portal.billing.activation.payg.sub",
            "Set a monthly limit. Pay for what you run.",
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
            "One invoice, card or bank transfer.",
          )}
          ariaLabel={t(
            "portal.billing.activation.prepay.title",
            "Prepay a year",
          )}
          onClick={onChoosePrepay}
        />
      </div>
      <div className="portal-billing__door-later">
        <Button variant="quiet" onClick={onClose}>
          {t("portal.billing.activation.maybeLater", "Maybe later")}
        </Button>
      </div>
    </Modal>
  );
}
