/**
 * Small popover picker for a taxonomy category's icon: a trigger button showing
 * the current icon, opening a grid of the curated {@link CATEGORY_ICON_OPTIONS}.
 * Icons render via {@link LocalIcon} (Material Symbols). No search yet — the
 * palette is small enough to scan.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Popover, SimpleGrid, Tooltip } from "@mantine/core";
import { LocalIcon } from "@app/components/shared/LocalIcon";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";
import {
  CATEGORY_ICON_OPTIONS,
  DEFAULT_CATEGORY_ICON,
} from "@app/data/categoryIcons";

interface CategoryIconPickerProps {
  /** Current icon key, or undefined to show the default placeholder. */
  value?: string;
  onChange: (icon: string) => void;
  ariaLabel: string;
}

export function CategoryIconPicker({
  value,
  onChange,
  ariaLabel,
}: CategoryIconPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Popover
      opened={open}
      onChange={setOpen}
      onDismiss={() => setOpen(false)}
      position="bottom-start"
      withArrow
      trapFocus
      withinPortal
      zIndex={Z_INDEX_AUTOMATE_DROPDOWN}
    >
      <Popover.Target>
        <button
          type="button"
          className="tax-icon-pick"
          onClick={() => setOpen((o) => !o)}
          aria-label={ariaLabel}
          aria-haspopup="true"
        >
          <LocalIcon icon={value || DEFAULT_CATEGORY_ICON} width="1.15rem" />
        </button>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <SimpleGrid cols={8} spacing={4} verticalSpacing={4}>
          {CATEGORY_ICON_OPTIONS.map((option) => (
            <Tooltip
              key={option.icon}
              label={option.label}
              withArrow
              openDelay={300}
            >
              <button
                type="button"
                className={`tax-icon-option${option.icon === value ? " is-selected" : ""}`}
                onClick={() => {
                  onChange(option.icon);
                  setOpen(false);
                }}
                aria-label={t(
                  "policies.taxonomy.pickIcon",
                  "Use {{label}} icon",
                  {
                    label: option.label,
                  },
                )}
                aria-pressed={option.icon === value}
              >
                <LocalIcon icon={option.icon} width="1.25rem" />
              </button>
            </Tooltip>
          ))}
        </SimpleGrid>
      </Popover.Dropdown>
    </Popover>
  );
}
