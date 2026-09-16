import { useTranslation } from "react-i18next";
import { Modal } from "@app/ui";
import type { Wallet } from "@portal/api/billing";
import { SpendLimitCard } from "@portal/components/billing/SpendLimitCard";
import { PrepaidCapacityCard } from "@portal/components/billing/PrepaidCapacityCard";

/**
 * The spend limit, as a dialog opened from the Processor row's own door.
 *
 * <p>A dialog rather than a panel below the page because the row states the limit already: an
 * editor sitting under the enterprise band is both a second copy of that fact and a control a
 * long way from the thing it edits.
 *
 * <p>Prepaid capacity rides along because it is the other answer to the same question. A buyer
 * who came here to raise a ceiling is the buyer for whom paying up front is cheaper, and the
 * offer has nowhere else to live now that the page carries no cards.
 */
export function SpendLimitModal({
  open,
  onClose,
  wallet,
  onWalletChange,
  onBuyBundle,
}: {
  open: boolean;
  onClose: () => void;
  wallet: Wallet;
  onWalletChange?: () => void;
  /** Leader-only: opens the bundle checkout. Omit for members, who see no offer. */
  onBuyBundle?: () => void;
}) {
  const { t } = useTranslation();
  const title = t(
    "portal.billing.spendLimitModal.title",
    "Monthly spend limit",
  );

  return (
    <Modal open={open} onClose={onClose} width="md" ariaLabel={title}>
      <div className="portal-billing__stack">
        <SpendLimitCard
          wallet={wallet}
          onWalletChange={onWalletChange}
          adjusting
          // The card's own cancel and save both settle to "not adjusting", which is this
          // dialog's close.
          onAdjustingChange={(adjusting) => {
            if (!adjusting) onClose();
          }}
        />
        <PrepaidCapacityCard wallet={wallet} onBuy={onBuyBundle} />
      </div>
    </Modal>
  );
}
