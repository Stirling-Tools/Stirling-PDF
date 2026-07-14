import { useState, type ReactNode } from "react";
import { Popover } from "@mantine/core";
import LocalIcon from "@app/components/shared/LocalIcon";

/**
 * A compact swatch trigger that opens a grid of selectable colours (a
 * radiogroup), with an optional leading "default/unset" cell shown as an icon
 * chip rather than a hue, and an optional footer slot (e.g. a custom-colour
 * input). Generic DS control — the caller supplies the colours and semantics.
 */
export interface ColorGridDefaultOption {
  /** The value stored when this cell is chosen (a sentinel, not a colour). */
  value: string;
  /** LocalIcon name shown in the chip. */
  icon: string;
  label: string;
  /** Native title tooltip. */
  hint?: string;
}

export interface ColorGridPickerProps {
  /** Current value: a colour from `colors`, or `defaultOption.value`. */
  value: string;
  onChange: (value: string) => void;
  /** Preset colours (any CSS colour string). */
  colors: string[];
  /** Accessible name for the trigger and the radiogroup. */
  ariaLabel: string;
  /** Grid columns; defaults to 5. */
  columns?: number;
  /** Optional leading "default/unset" cell. */
  defaultOption?: ColorGridDefaultOption;
  /** Optional content below the grid (e.g. a custom-colour picker). */
  footer?: ReactNode;
  /** Popover z-index, for use inside modals. */
  zIndex?: number;
}

const SWATCH = "1.75rem";

export function ColorGridPicker({
  value,
  onChange,
  colors,
  ariaLabel,
  columns = 5,
  defaultOption,
  footer,
  zIndex,
}: ColorGridPickerProps) {
  const [opened, setOpened] = useState(false);
  const isDefault = !!defaultOption && value === defaultOption.value;
  const select = (v: string) => {
    onChange(v);
    setOpened(false);
  };
  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      withinPortal
      zIndex={zIndex}
      shadow="md"
      radius="md"
      withArrow
    >
      <Popover.Target>
        <button
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          onClick={() => setOpened((o) => !o)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.25rem 0.5rem",
            borderRadius: "8px",
            border: "1px solid var(--c-border)",
            background: "var(--c-input-bg)",
            cursor: "pointer",
          }}
        >
          {defaultOption && value === defaultOption.value ? (
            <span
              style={{
                display: "grid",
                placeItems: "center",
                width: "1.25rem",
                height: "1.25rem",
                borderRadius: "5px",
                background: "var(--c-surface-raised)",
                boxShadow: "inset 0 0 0 1px var(--c-border)",
              }}
            >
              <LocalIcon
                icon={defaultOption.icon}
                width="0.875rem"
                height="0.875rem"
                style={{ color: "var(--c-text-muted)" }}
              />
            </span>
          ) : (
            <span
              style={{
                width: "1.25rem",
                height: "1.25rem",
                borderRadius: "5px",
                background: value,
                boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.15)",
              }}
            />
          )}
          <LocalIcon
            icon="expand-more-rounded"
            width="1rem"
            height="1rem"
            style={{ color: "var(--c-text-subtle)" }}
          />
        </button>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <div
          role="radiogroup"
          aria-label={ariaLabel}
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${columns}, ${SWATCH})`,
            gap: "0.6875rem",
            justifyContent: "center",
          }}
        >
          {defaultOption && (
            <button
              type="button"
              role="radio"
              aria-checked={isDefault}
              aria-label={defaultOption.label}
              title={defaultOption.hint}
              onClick={() => select(defaultOption.value)}
              style={{
                display: "grid",
                placeItems: "center",
                width: SWATCH,
                height: SWATCH,
                padding: 0,
                borderRadius: "8px",
                cursor: "pointer",
                background: "var(--c-surface-raised)",
                border: "1px solid var(--c-border)",
                outline: isDefault ? "2px solid var(--c-text)" : "none",
                outlineOffset: "2px",
              }}
            >
              <LocalIcon
                icon={defaultOption.icon}
                width="1.125rem"
                height="1.125rem"
                style={{ color: "var(--c-text-muted)" }}
              />
            </button>
          )}
          {colors.map((color) => {
            const selected = value.toLowerCase() === color.toLowerCase();
            return (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={color}
                onClick={() => select(color)}
                style={{
                  width: SWATCH,
                  height: SWATCH,
                  padding: 0,
                  border: "none",
                  borderRadius: "8px",
                  background: color,
                  cursor: "pointer",
                  outline: selected ? "2px solid var(--c-text)" : "none",
                  outlineOffset: "2px",
                  boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.12)",
                }}
              />
            );
          })}
        </div>
        {footer && (
          <div
            style={{
              marginTop: "0.5rem",
              paddingTop: "0.5rem",
              borderTop: "1px solid var(--c-border-subtle)",
            }}
          >
            {footer}
          </div>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
