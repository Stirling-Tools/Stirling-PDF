import type { ReactNode } from "react";
import { Modal } from "@app/ui";
import "@app/components/shared/FlowModal.css";

/**
 * The shared Modal owns focus trapping, scroll locking and dismissal. This wrapper adds the
 * flow's stacked body, footer spacing and takeover width. Omitting `header` removes the title
 * band; hosts then supply their own heading and close button inside the body.
 */
export function FlowModal({
  open,
  onClose,
  label,
  header,
  footer,
  size = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Accessible name, used when `header` supplies no visible heading of its own. */
  label: string;
  header?: ReactNode;
  footer?: ReactNode;
  /** `md` for the task dialogs, `lg` for the procurement takeover and Calendly. */
  size?: "md" | "lg";
  children: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel={label}
      width={size}
      className={`portal-flowmodal portal-flowmodal--${size}`}
      title={header}
      footer={footer}
    >
      {children}
    </Modal>
  );
}
