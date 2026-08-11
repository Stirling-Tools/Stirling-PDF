import { useTranslation } from "react-i18next";
import { Button, Card, Modal } from "@app/ui";
import { PrepayModalHeader } from "@processor/components/billing/PrepayModalHeader";

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
        "processor-billing__door" +
        (accent ? " processor-billing__door--accent" : "")
      }
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <span className="processor-billing__door-head">
        <span className="processor-billing__door-title">{title}</span>
        {badge && (
          <span className="processor-billing__door-badge">{badge}</span>
        )}
      </span>
      <span className="processor-billing__door-sub">{sub}</span>
    </Card>
  );
}

/**
 * The "turn on the Processor" fork (demo D97): a free team chooses how to pay
 * before any card is entered. Two door-cards, matching the demo —
 *
 *   - Pay as you go → the metered subscription checkout (spend limit + card).
 *   - Prepay a year → the discounted bundle (calculator + one-time payment); no
 *     spend-limit step, since the buyer commits to a fixed pool up front.
 *
 * Same per-PDF rate on both paths — prepay just front-loads two free months.
 *
 * Note: auto-standing-up the metered subscription off the saved card so metering
 * resumes once a prepaid pool empties is a known follow-up, NOT yet wired — a
 * prepay-only team isn't metered past its pool today.
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
      className="processor-billing__bundle-modal"
      ariaLabel={t(
        "processor.billing.activation.title",
        "Switch on the Processor",
      )}
    >
      <PrepayModalHeader
        step={1}
        title={t(
          "processor.billing.activation.title",
          "Switch on the Processor",
        )}
        onClose={onClose}
      />
      <div className="processor-billing__door-grid">
        <DoorCard
          title={t("processor.billing.activation.payg.title", "Pay as you go")}
          sub={t(
            "processor.billing.activation.payg.sub",
            "Set a monthly limit. Pay for what you run.",
          )}
          ariaLabel={t(
            "processor.billing.activation.payg.title",
            "Pay as you go",
          )}
          onClick={onChoosePayg}
        />
        <DoorCard
          accent
          title={t(
            "processor.billing.activation.prepay.title",
            "Prepay a year",
          )}
          badge={t(
            "processor.billing.activation.prepay.badge",
            "2 months free",
          )}
          sub={t(
            "processor.billing.activation.prepay.sub",
            "One invoice, card or bank transfer.",
          )}
          ariaLabel={t(
            "processor.billing.activation.prepay.title",
            "Prepay a year",
          )}
          onClick={onChoosePrepay}
        />
      </div>
      <div className="processor-billing__door-later">
        <Button variant="quiet" onClick={onClose}>
          {t("processor.billing.activation.maybeLater", "Maybe later")}
        </Button>
      </div>
    </Modal>
  );
}
