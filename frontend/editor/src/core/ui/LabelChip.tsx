import type { ReactNode } from "react";
import CloseIcon from "@mui/icons-material/Close";
import { LocalIcon } from "@app/components/shared/LocalIcon";
import "@app/ui/LabelChip.css";

export interface LabelChipProps {
  /** The label text. */
  label: string;
  /** Material Symbols key for a leading icon; ignored when `leading` is given. */
  icon?: string;
  /** Custom leading node (e.g. an icon picker), overriding `icon`. */
  leading?: ReactNode;
  /** Optional trailing count (e.g. how many files carry this label). */
  count?: number;
  /** Show a trailing `×`; called on click. */
  onRemove?: () => void;
  /** Accessible name for the remove button. */
  removeAriaLabel?: string;
}

/**
 * A classification-label pill: leading icon (or a custom control like an icon
 * picker) + name, with an optional count and remove button. The shared look for
 * every place labels are shown as chips — the team labels editor and the
 * sidebar category manager both render this so they stay visually identical.
 */
export function LabelChip({
  label,
  icon,
  leading,
  count,
  onRemove,
  removeAriaLabel,
}: LabelChipProps) {
  return (
    <span className="sui-labelchip" role="listitem">
      {leading ?? (
        <span className="sui-labelchip-icon">
          <LocalIcon icon={icon || "sell"} width="1rem" />
        </span>
      )}
      <span className="sui-labelchip-name" title={label}>
        {label}
      </span>
      {count != null && count > 0 && (
        <span className="sui-labelchip-count">{count}</span>
      )}
      {onRemove && (
        <button
          type="button"
          className="sui-labelchip-remove"
          onClick={onRemove}
          aria-label={removeAriaLabel ?? `Remove ${label}`}
        >
          <CloseIcon sx={{ fontSize: "0.85rem" }} />
        </button>
      )}
    </span>
  );
}
