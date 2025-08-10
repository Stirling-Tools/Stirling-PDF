import React from "react";
import { Box, Text, Stack, Button } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ToolRegistry } from "../../types/tool";

interface ToolPickerProps {
  selectedToolKey: string | null;
  onSelect: (id: string) => void;
  /** Pre-filtered tools to display */
  filteredTools: [string, ToolRegistry[string]][];
}

const ToolPicker = ({ selectedToolKey, onSelect, filteredTools }: ToolPickerProps) => {
  const { t } = useTranslation();

  return (
    <Box>
      <Stack align="flex-start">
        {filteredTools.length === 0 ? (
          <Text c="dimmed" size="sm">
            {t("toolPicker.noToolsFound", "No tools found")}
          </Text>
        ) : (
          filteredTools.map(([id, { icon, name }]) => (
            <Button
              key={id}
              data-testid={`tool-${id}`}
              variant={selectedToolKey === id ? "filled" : "subtle"}
              onClick={() => onSelect(id)}
              size="md"
              radius="md"
              leftSection={icon}
              fullWidth
              justify="flex-start"
            >
              {name}
            </Button>
          ))
        )}
      </Stack>
    </Box>
  );
};

export default ToolPicker;
