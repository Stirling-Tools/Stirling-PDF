import type { ReactNode } from "react";
import { FlowModal } from "@portal/components/shared/FlowModal";
import "@portal/views/Procurement.css";

// Re-exported for the extras dialogs that trap focus themselves.
export { useFocusTrap } from "@portal/components/shared/FlowModal";

/**
 * The procurement takeover: the shared {@link FlowModal} at takeover width. Chrome and copy only —
 * the shell (portal, focus trap, Escape, close, header/body bands) is shared, so this dialog cannot
 * drift from the trial and licence dialogs the way two hand-rolled shells did.
 */
export function ProcurementModal({
  open,
  onClose,
  title,
  subtitle,
  headerless = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Dialog label. Omit `subtitle` (and pass `headerless`) when the step renders its own heading. */
  title: string;
  subtitle?: string;
  /**
   * Skip the title block: the step inside supplies the heading, step badge and progress (see
   * StepModalHeader), so rendering ours too would stack two headers.
   */
  headerless?: boolean;
  children: ReactNode;
}) {
  return (
    <FlowModal
      open={open}
      onClose={onClose}
      label={title}
      size="lg"
      header={
        headerless ? undefined : (
          <>
            <h2 className="portal-procmodal__title">{title}</h2>
            {subtitle && <p className="portal-procmodal__sub">{subtitle}</p>}
          </>
        )
      }
    >
      {children}
    </FlowModal>
  );
}
