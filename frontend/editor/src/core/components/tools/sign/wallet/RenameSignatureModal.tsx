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
  onRename: (name: string) => void;
}

export function RenameSignatureModal({
  currentName,
  onClose,
  onRename,
}: RenameSignatureModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(currentName);
  const canSave = name.trim().length > 0;

  function submit() {
    if (canSave) onRename(name);
  }

  const footer = (
    <div className={styles.dialogFooter}>
      <Button variant="tertiary" onClick={onClose}>
        {t("sign.wallet.create.cancel", "Cancel")}
      </Button>
      <Button onClick={submit} disabled={!canSave}>
        {t("sign.wallet.rename.save", "Save")}
      </Button>
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={t("sign.wallet.rename.title", "Rename signature")}
      width="sm"
      footer={footer}
    >
      <FormField label={t("sign.wallet.create.name", "Name")}>
        <Input
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
        />
      </FormField>
    </Modal>
  );
}
