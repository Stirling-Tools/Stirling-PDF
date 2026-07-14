/**
 * Small popover picker for a classification label's icon: a trigger button
 * showing the current icon, opening a grid of the curated
 * {@link LABEL_ICON_OPTIONS}. Icons render via {@link LocalIcon} (Material
 * Symbols). No search yet — the palette is small enough to scan.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Popover, SimpleGrid, Tooltip } from "@mantine/core";
import { ActionIcon } from "@app/ui/ActionIcon";
import { LocalIcon } from "@app/components/shared/LocalIcon";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";
import { LABEL_ICON_OPTIONS, DEFAULT_LABEL_ICON } from "@app/data/labelIcons";

interface LabelIconPickerProps {
  /** Current icon key, or undefined to show the default placeholder. */
  value?: string;
  onChange: (icon: string) => void;
  ariaLabel: string;
}

export function LabelIconPicker({
  value,
  onChange,
  ariaLabel,
}: LabelIconPickerProps) {
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
        <ActionIcon
          variant="quiet"
          className="labels-icon-pick"
          onClick={() => setOpen((o) => !o)}
          aria-label={ariaLabel}
          aria-haspopup="true"
        >
          <LocalIcon icon={value || DEFAULT_LABEL_ICON} width="1.15rem" />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown p="xs" style={{ maxHeight: 280, overflowY: "auto" }}>
        <SimpleGrid cols={10} spacing={4} verticalSpacing={4}>
          {LABEL_ICON_OPTIONS.map((option) => {
            const iconLabel = t(
              `policies.labels.iconName.${option.icon}`,
              option.label,
            );
            return (
              <Tooltip
                key={option.icon}
                label={iconLabel}
                withArrow
                openDelay={300}
              >
                <ActionIcon
                  variant="quiet"
                  className={`labels-icon-option${option.icon === value ? " is-selected" : ""}`}
                  onClick={() => {
                    onChange(option.icon);
                    setOpen(false);
                  }}
                  aria-label={t(
                    "policies.labels.pickIcon",
                    "Use {{label}} icon",
                    {
                      label: iconLabel,
                    },
                  )}
                  aria-pressed={option.icon === value}
                >
                  <LocalIcon icon={option.icon} width="1.25rem" />
                </ActionIcon>
              </Tooltip>
            );
          })}
        </SimpleGrid>
      </Popover.Dropdown>
    </Popover>
  );
}
