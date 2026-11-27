import React, { useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Box, Stack, SimpleGrid, Tooltip, Popover } from "@mantine/core";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { Icon } from "@editor/ui/Icon";
import {
  iconMap,
  iconOptions,
} from "@editor/components/tools/automate/iconMap";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@editor/styles/zIndex";

// Sits beside the name input, so it takes a field's surface and border rather than the button's.
const FIELD_LOOK = {
  "--ai-bg": "var(--c-input-bg)",
  "--ai-hover": "var(--c-hover)",
  "--ai-bd": "1px solid var(--c-border)",
} as CSSProperties;

interface IconSelectorProps {
  value?: string;
  onChange?: (iconKey: string) => void;
  size?: "sm" | "md" | "lg";
}

export default function IconSelector({
  value = "SettingsIcon",
  onChange,
  size = "sm",
}: IconSelectorProps) {
  const { t } = useTranslation();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const selectedIcon = iconMap[value] ?? iconMap.SettingsIcon;

  const handleIconSelect = (iconKey: string) => {
    onChange?.(iconKey);
    setIsDropdownOpen(false);
  };

  const iconSize = size === "sm" ? 16 : size === "md" ? 18 : 20;

  return (
    <Popover
      opened={isDropdownOpen}
      onClose={() => setIsDropdownOpen(false)}
      onDismiss={() => setIsDropdownOpen(false)}
      position="bottom-start"
      withArrow
      trapFocus
      returnFocus
      withinPortal
      zIndex={Z_INDEX_AUTOMATE_DROPDOWN}
    >
      <Popover.Target>
        <ActionIcon
          variant="secondary"
          accent="neutral"
          size={size}
          aria-label={t("automate.creation.icon.choose", "Choose icon")}
          title={t("automate.creation.icon.choose", "Choose icon")}
          aria-haspopup="dialog"
          aria-expanded={isDropdownOpen}
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          style={FIELD_LOOK}
        >
          <Icon name={selectedIcon} size={iconSize} />
        </ActionIcon>
      </Popover.Target>

      <Popover.Dropdown>
        <Stack gap="xs">
          <SimpleGrid cols={4} spacing="xs">
            {iconOptions.map((option) => {
              const optionIcon = iconMap[option.value];
              const isSelected = value === option.value;

              return (
                <Tooltip key={option.value} label={option.label}>
                  <Box
                    component="button"
                    type="button"
                    aria-label={option.label}
                    aria-pressed={isSelected}
                    onClick={() => handleIconSelect(option.value)}
                    style={{
                      border: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0.5rem",
                      borderRadius: "0.25rem",
                      cursor: "pointer",
                      backgroundColor: isSelected
                        ? "var(--c-active)"
                        : "transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor =
                          "var(--c-hover)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                  >
                    <Icon
                      name={optionIcon}
                      size={iconSize}
                      style={{
                        color: isSelected
                          ? "var(--c-text)"
                          : "var(--c-text-muted)",
                      }}
                    />
                  </Box>
                </Tooltip>
              );
            })}
          </SimpleGrid>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
