import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, Text, Stack, Button, SimpleGrid, Tooltip, Popover } from "@mantine/core";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { iconMap, iconOptions } from '@app/components/tools/automate/iconMap';

interface IconSelectorProps {
  value?: string;
  onChange?: (iconKey: string) => void;
  size?: "sm" | "md" | "lg";
}

export default function IconSelector({ value = "SettingsIcon", onChange, size = "sm" }: IconSelectorProps) {
  const { t } = useTranslation();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const selectedIconComponent = iconMap[value as keyof typeof iconMap] || iconMap.SettingsIcon;

  const handleIconSelect = (iconKey: string) => {
    onChange?.(iconKey);
    setIsDropdownOpen(false);
  };

  const iconSize = size === "sm" ? 16 : size === "md" ? 18 : 20;

  return (
    <Stack gap="1px">
      <Text size="sm" fw={600} style={{ color: "var(--mantine-color-primary)" }}>
        {t("automate.creation.icon.label", "Icon")}
      </Text>

      <Popover
        opened={isDropdownOpen}
        onClose={() => setIsDropdownOpen(false)}
        onDismiss={() => setIsDropdownOpen(false)}
        position="bottom-start"
        withArrow
        trapFocus
      >
        <Popover.Target>
          <Button
            variant="outline"
            size={size}
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            style={{
              width: size === "sm" ? "3.75rem" : "4.375rem",
              position: "relative",
              display: "flex",
              justifyContent: "flex-start",
              paddingLeft: "0.5rem",
              borderColor: "var(--mantine-color-gray-3)",
              color: "var(--mantine-color-text)",

            }}
          >
            {React.createElement(selectedIconComponent, { style: { fontSize: iconSize } })}
            <KeyboardArrowDownIcon
              style={{
                fontSize: iconSize * 0.8,
                position: "absolute",
                right: "0.25rem",
                top: "50%",
                transform: "translateY(-50%)",
              }}
            />
          </Button>
        </Popover.Target>

        <Popover.Dropdown>
          <Stack gap="xs">
            <SimpleGrid cols={4} spacing="xs">
              {iconOptions.map((option) => {
                const IconComponent = iconMap[option.value as keyof typeof iconMap];
                const isSelected = value === option.value;

                return (
                  <Tooltip key={option.value} label={option.label}>
                    <Box
                      onClick={() => handleIconSelect(option.value)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "0.5rem",
                        borderRadius: "0.25rem",
                        cursor: "pointer",
                        backgroundColor: isSelected ? "var(--mantine-color-gray-1)" : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = "var(--mantine-color-gray-0)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }
                      }}
                    >
                      <IconComponent
                        style={{
                          fontSize: iconSize,
                          color: isSelected ? "var(--mantine-color-gray-9)" : "var(--mantine-color-gray-7)",
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
