import type { ReactNode } from "react";
import { Modal } from "@app/ui";
import "@portal/components/shared/FlowModal.css";

/**
 * The one dialog shell for the portal's flows — procurement's takeover, the trial/licence/schedule
 * dialogs, the legal reader.
 *
 * A thin wrapper over the shared {@link Modal}, which already owns the portal, focus trap, scroll
 * lock, Escape and backdrop dismissal, and the close button. This used to reimplement all of it,
 * which is precisely how the procurement dialogs drifted from the billing ones that were already on
 * the shared Modal. What is left here is only what the flows genuinely add: a stacked body, a
 * space-between footer for Back/Continue, and the takeover width.
 *
 * `header` is the shared Modal's title slot, so a flow can seat its own stepped header (see
 * StepModalHeader) in the band. Omit it and the band goes entirely, close included — the convention
 * the prepay checkout already follows for a step that draws its own heading and close. Escape and
 * the backdrop still dismiss, so such a dialog is never inescapable.
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
