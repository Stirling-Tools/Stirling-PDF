import type { ReactNode } from "react";
import { FlowModal } from "@processor/components/shared/FlowModal";
import "@processor/views/Procurement.css";

/**
 * The procurement takeover: the shared {@link FlowModal} at takeover width. Chrome and copy only —
 * the shell (processor, focus trap, Escape, close, header/body bands) is shared, so this dialog cannot
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
   * Skip the title block, which takes the shell's close with it: the step inside supplies the
   * heading, step badge and its own close (see StepModalHeader), so the shell would otherwise stack
   * a second header and leave a stray close above it. Escape and the backdrop still dismiss.
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
            <h2 className="processor-procmodal__title">{title}</h2>
            {subtitle && <p className="processor-procmodal__sub">{subtitle}</p>}
          </>
        )
      }
    >
      {children}
    </FlowModal>
  );
}
