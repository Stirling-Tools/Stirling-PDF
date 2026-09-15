import { ActionIcon, Tooltip, type TooltipPlacement } from "@app/ui";
import LocalIcon from "@app/components/shared/LocalIcon";
import "@portal/components/InfoHint.css";

export interface InfoHintProps {
  /** The explanation. Shown on hover, keyboard focus and tap. */
  content: string;
  /** Accessible name for the trigger, e.g. "What does skipped mean?". */
  label: string;
  placement?: TooltipPlacement;
}

/**
 * The small circled "i" that carries a line of explanation next to a heading or
 * a label, so the copy is there when someone wants it and out of the way when
 * they do not.
 *
 * Sized to the text rather than to a control, because the usual home for one of
 * these is inside a label whose line box it must not inflate.
 */
export function InfoHint({ content, label, placement = "top" }: InfoHintProps) {
  return (
    <Tooltip content={content} placement={placement} className="portal-hint">
      <ActionIcon variant="quiet" size="sm" aria-label={label}>
        <LocalIcon icon="info-rounded" width="0.9rem" />
      </ActionIcon>
    </Tooltip>
  );
}
