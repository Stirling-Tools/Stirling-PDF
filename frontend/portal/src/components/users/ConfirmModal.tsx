import { useTranslation } from "react-i18next";
import { Button, Modal } from "@shared/components";
import "@portal/views/Users.css";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  /** Red confirm button for destructive actions. */
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Small reusable confirm dialog for destructive/irreversible actions. */
export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onCancel}
      width="sm"
      title={title}
      footer={
        <div className="portal-users__modal-footer">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            size="sm"
            accent={danger ? "red" : undefined}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="portal-users__confirm-body">{body}</p>
    </Modal>
  );
}
