import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, Text, Stack, SimpleGrid, Tooltip, Popover } from "@mantine/core";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { Icon } from "@editor/ui/Icon";
import {
  iconMap,
  iconOptions,
} from "@editor/components/tools/automate/iconMap";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@editor/styles/zIndex";

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
    <Stack gap="1px">
      <Text size="sm" fw={500} style={{ color: "var(--c-text)" }}>
        {t("automate.creation.icon.label", "Icon")}
      </Text>

      <Popover
        opened={isDropdownOpen}
        onClose={() => setIsDropdownOpen(false)}
        onDismiss={() => setIsDropdownOpen(false)}
        position="bottom-start"
        withArrow
        trapFocus
        withinPortal
        zIndex={Z_INDEX_AUTOMATE_DROPDOWN}
      >
        <Popover.Target>
          <ActionIcon
            variant="secondary"
            size={size}
            aria-label={t("automate.creation.icon.label", "Icon")}
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            style={{
              width: size === "sm" ? "2.5rem" : "3rem",
              position: "relative",
              display: "flex",
              justifyContent: "flex-start",
              paddingLeft: "0.5rem",
              borderColor: "var(--c-border)",
              color: "var(--c-text)",
            }}
          >
            <Icon name={selectedIcon} size={iconSize} />
            <Icon
              name="chevron-down"
              size={iconSize * 0.8}
              style={{
                position: "absolute",
                right: "0.25rem",
                top: "50%",
                transform: "translateY(-50%)",
              }}
            />
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
                      role="button"
                      tabIndex={0}
                      aria-label={option.label}
                      aria-pressed={isSelected}
                      onClick={() => handleIconSelect(option.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleIconSelect(option.value);
                        }
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "0.5rem",
                        borderRadius: "0.25rem",
                        cursor: "pointer",
                        backgroundColor: isSelected
                          ? "var(--c-primary-subtle)"
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
                            ? "var(--c-accent-fg, var(--c-primary))"
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
    </Stack>
  );
}
