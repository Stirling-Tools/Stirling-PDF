import React, { useState } from "react";
import { Box, Text, Stack, Button, TextInput, Group } from "@mantine/core";
import { useTranslation } from "react-i18next";

type Tool = {
  icon: React.ReactNode;
  name: string;
};

type ToolRegistry = {
  [id: string]: Tool;
};

interface ToolPickerProps {
  selectedToolKey: string;
  onSelect: (id: string) => void;
  toolRegistry: ToolRegistry;
}

const ToolPicker: React.FC<ToolPickerProps> = ({ selectedToolKey, onSelect, toolRegistry }) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  const filteredTools = Object.entries(toolRegistry).filter(([_, { name }]) =>
    name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Box >
      <TextInput
        placeholder={t("toolPicker.searchPlaceholder", "Search tools...")}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        mb="md"
        autoComplete="off"
      />
      <Stack  align="flex-start">
        {filteredTools.length === 0 ? (
          <Text c="dimmed" size="sm">
            {t("toolPicker.noToolsFound", "No tools found")}
          </Text>
        ) : (
          filteredTools.map(([id, { icon, name }]) => (
            <Button
              key={id}
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
