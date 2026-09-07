import { useState, type ReactNode } from "react";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Dropdown } from "@app/ui/Dropdown";
import "@app/ui/IconPicker.css";

export interface IconPickerOption {
  /** Stable identifier stored as the picked value. */
  key: string;
  /** The glyph to show, sized by the caller. */
  node: ReactNode;
  /** Accessible name for this option (falls back to the key). */
  label?: string;
}

export interface IconPickerProps {
  /** The picked option's key. */
  value: string;
  onChange: (key: string) => void;
  /** The icons to choose from, in display order. The caller supplies the set. */
  options: IconPickerOption[];
  /** Accessible name for the trigger (e.g. "Icon"). */
  ariaLabel: string;
  size?: "sm" | "md" | "lg";
}

/**
 * Pick an icon from a caller-supplied set. The chosen glyph is the trigger; the menu is a grid. The
 * icon set is injected (via {@link options}) rather than baked in, so any surface - a pipeline, a
 * watched folder, an automation - passes its own vocabulary and shares the one control.
 */
export function IconPicker({
  value,
  onChange,
  options,
  ariaLabel,
  size = "sm",
}: IconPickerProps) {
  // Controlled so a grid button (not a Dropdown.Item) can close the menu on pick.
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.key === value) ?? options[0];

  function pick(key: string) {
    onChange(key);
    setOpen(false);
  }

  return (
    <Dropdown.Root open={open} onOpenChange={setOpen} align="start">
      <Dropdown.Trigger>
        <ActionIcon variant="secondary" size={size} aria-label={ariaLabel}>
          {selected?.node}
        </ActionIcon>
      </Dropdown.Trigger>
      <Dropdown.Menu>
        <div className="sui-icon-picker__grid">
          {options.map((option) => {
            const isSelected = option.key === value;
            return (
              <button
                key={option.key}
                type="button"
                className={
                  "sui-icon-picker__option" +
                  (isSelected ? " sui-icon-picker__option--selected" : "")
                }
                aria-label={option.label ?? option.key}
                aria-pressed={isSelected}
                onClick={() => pick(option.key)}
              >
                {option.node}
              </button>
            );
          })}
        </div>
      </Dropdown.Menu>
    </Dropdown.Root>
  );
}
