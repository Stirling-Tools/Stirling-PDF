import React, { useState } from "react";
import { Box, Text, Stack, Button, TextInput } from "@mantine/core";

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
  const [search, setSearch] = useState("");

  const filteredTools = Object.entries(toolRegistry).filter(([_, { name }]) =>
    name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Box
      style={{
        width: 220,
        borderRight: "1px solid #e9ecef",
        minHeight: "100vh",
        padding: 16,
        position: "fixed",
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 100,
        overflowY: "auto",
      }}
    >
      <Text size="lg" fw={500} mb="md">
        Tools
      </Text>
      <TextInput
        placeholder="Search tools..."
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        mb="md"
        autoComplete="off"
      />
      <Stack gap="sm">
        {filteredTools.length === 0 ? (
          <Text c="dimmed" size="sm">
            No tools found
          </Text>
        ) : (
          filteredTools.map(([id, { icon, name }]) => (
            <Button
              key={id}
              variant={selectedToolKey === id ? "filled" : "subtle"}
              onClick={() => onSelect(id)}
              fullWidth
              size="md"
              radius="md"
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
