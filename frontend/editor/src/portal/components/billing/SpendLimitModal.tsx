import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Modal } from "@app/ui";
import { updateCap, type Wallet } from "@portal/api/billing";
import { ProcessorSpendFields } from "@portal/components/billing/ProcessorSpendFields";

/** Changes the existing ceiling without opening another checkout. */
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
  onBuyBundle?: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<number | null>(
    wallet.noCap ? null : wallet.capUsd,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (open) {
      setDraft(wallet.noCap ? null : wallet.capUsd);
      setError(false);
    }
  }, [open, wallet.noCap, wallet.capUsd]);
  async function save() {
    setSaving(true);
    setError(false);
    try {
      await updateCap(draft);
      onWalletChange?.();
      onClose();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      width="md"
      title={t("portal.billing.simple.setLimit", "Set a spend limit")}
      subtitle={t(
        "portal.billing.simple.limitIntro",
        "Cap what the Processor can bill each month.",
      )}
    >
      <ProcessorSpendFields
        value={draft}
        onChange={setDraft}
        currency={wallet.currency ?? "usd"}
        rate={wallet.pricePerDocMinor}
        disabled={saving}
      />
      <p className="portal-billing__checkout-finePrint">
        {t(
          "portal.billing.simple.billingNote",
          "No standing fee. Credits bill monthly as used. Cancel any time in Usage & Billing.",
        )}
      </p>
      {error && (
        <Banner
          tone="danger"
          title={t(
            "portal.billing.spendLimit.saveError",
            "Couldn't save limit",
          )}
        />
      )}
      <div className="portal-billing__checkout-cap-actions">
        {onBuyBundle ? (
          <Button variant="secondary" onClick={onBuyBundle} disabled={saving}>
            {t("portal.billing.spendLimit.buyCredits", "Buy credits")}
          </Button>
        ) : (
          <span />
        )}
        <Button
          onClick={save}
          loading={saving}
          disabled={draft !== null && (!Number.isFinite(draft) || draft <= 0)}
        >
          {t("portal.billing.spendLimit.save", "Save limit")}
        </Button>
      </div>
    </Modal>
  );
}
