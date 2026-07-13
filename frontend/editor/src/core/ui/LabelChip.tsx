import type { KeyboardEvent, ReactNode } from "react";
import CloseIcon from "@mui/icons-material/Close";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
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
  /** Show a trailing checkbox; called on click. */
  onSelectToggle?: () => void;
  /** Selected state, reflected by the checkbox and chip tint. */
  selected?: boolean;
  /** Accessible name for the selection checkbox. */
  selectAriaLabel?: string;
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
  onSelectToggle,
  selected,
  selectAriaLabel,
}: LabelChipProps) {
  // Selection mode: the whole pill is the toggle (leading must be static — the
  // caller drops the icon picker here to avoid a nested control), with a
  // decorative checkbox as the indicator.
  const selectProps = onSelectToggle
    ? {
        role: "checkbox" as const,
        "aria-checked": selected ?? false,
        "aria-label": selectAriaLabel ?? `Select ${label}`,
        tabIndex: 0,
        onClick: onSelectToggle,
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelectToggle();
          }
        },
      }
    : { role: "listitem" as const };
  return (
    <span
      className={
        "sui-labelchip" +
        (onSelectToggle ? " sui-labelchip--selectable" : "") +
        (selected ? " sui-labelchip--selected" : "")
      }
      {...selectProps}
    >
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
      {onSelectToggle ? (
        <span className="sui-labelchip-check" aria-hidden>
          {selected ? (
            <CheckBoxIcon sx={{ fontSize: "1.05rem" }} />
          ) : (
            <CheckBoxOutlineBlankIcon sx={{ fontSize: "1.05rem" }} />
          )}
        </span>
      ) : (
        onRemove && (
          <button
            type="button"
            className="sui-labelchip-remove"
            onClick={onRemove}
            aria-label={removeAriaLabel ?? `Remove ${label}`}
          >
            <CloseIcon sx={{ fontSize: "0.85rem" }} />
          </button>
        )
      )}
    </span>
  );
}
