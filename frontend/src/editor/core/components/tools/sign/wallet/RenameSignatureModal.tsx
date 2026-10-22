import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { FormField } from "@app/ui/FormField";
import { Input } from "@app/ui/Input";
import { Modal } from "@app/ui/Modal";
import styles from "@app/components/tools/sign/wallet/SignatureWallet.module.css";

interface RenameSignatureModalProps {
  currentName: string;
  onClose: () => void;
  onRename: (name: string) => Promise<boolean>;
}

export function RenameSignatureModal({
  currentName,
  onClose,
  onRename,
}: RenameSignatureModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const canSave = name.trim().length > 0;

  async function submit() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      if (await onRename(name)) onClose();
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <div className={styles.dialogFooter}>
      <Button variant="tertiary" onClick={onClose} disabled={saving}>
        {t("sign.wallet.create.cancel", "Cancel")}
      </Button>
      <Button
        onClick={() => void submit()}
        disabled={!canSave}
        loading={saving}
      >
        {t("sign.wallet.rename.save", "Save")}
      </Button>
    </div>
  );

  return (
    <Modal
      open
      onClose={() => {
        if (!saving) onClose();
      }}
      title={t("sign.wallet.rename.title", "Rename signature")}
      width="sm"
      footer={footer}
    >
      <FormField label={t("sign.wallet.create.name", "Name")}>
        <Input
          value={name}
          maxLength={60}
          disabled={saving}
          onChange={(event) => setName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
        />
      </FormField>
    </Modal>
  );
}
