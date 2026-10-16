import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { Modal } from "@app/ui/Modal";
import styles from "@app/components/tools/sign/wallet/SignatureWallet.module.css";

interface DeleteSignatureModalProps {
  name: string;
  onClose: () => void;
  onConfirm: () => Promise<boolean>;
}

export function DeleteSignatureModal({
  name,
  onClose,
  onConfirm,
}: DeleteSignatureModalProps) {
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState(false);

  async function confirm() {
    if (deleting) return;
    setDeleting(true);
    try {
      if (await onConfirm()) onClose();
    } finally {
      setDeleting(false);
    }
  }

  const footer = (
    <div className={styles.dialogFooter}>
      <Button variant="tertiary" onClick={onClose} disabled={deleting}>
        {t("sign.wallet.create.cancel", "Cancel")}
      </Button>
      <Button accent="danger" onClick={() => void confirm()} loading={deleting}>
        {t("sign.wallet.delete.confirm", "Delete")}
      </Button>
    </div>
  );

  return (
    <Modal
      open
      onClose={() => {
        if (!deleting) onClose();
      }}
      title={t("sign.wallet.delete.title", "Delete this signature?")}
      width="sm"
      footer={footer}
    >
      <p className={styles.dialogBody}>
        {t(
          "sign.wallet.delete.body",
          '"{{name}}" is removed from your signatures. Documents you already signed keep it.',
          { name },
        )}
      </p>
    </Modal>
  );
}
