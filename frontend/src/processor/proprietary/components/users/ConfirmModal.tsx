import { useTranslation } from "react-i18next";
import { Button, Modal } from "@editor/ui";
import "@processor/views/Users.css";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";

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
          <Button
            variant="tertiary"
            size="sm"
            disabled={busy}
            onClick={onCancel}
          >
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            size="sm"
            accent={danger ? "danger" : undefined}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {/* Every body here names a member, an invitee or a team. */}
      <p className={`portal-users__confirm-body ${privateContentClassName}`}>
        {body}
      </p>
    </Modal>
  );
}
