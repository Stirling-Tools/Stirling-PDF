import React from "react";
import { Button, Tooltip } from "@mantine/core";
import { type ToolRegistryEntry } from "../../../data/toolRegistry";

interface ToolButtonProps {
  id: string;
  tool: ToolRegistryEntry;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

const ToolButton: React.FC<ToolButtonProps> = ({ id, tool, isSelected, onSelect }) => {
  return (
    <Tooltip key={id} label={tool.description} withArrow openDelay={500}>
      <Button
        variant={isSelected ? "filled" : "subtle"}
        onClick={() => onSelect(id)}
        size="md"
        radius="md"
        leftSection={<div className="tool-button-icon" style={{ color: "var(--tools-text-and-icon-color)" }}>{tool.icon}</div>}
        fullWidth
        justify="flex-start"
        className="tool-button"
        styles={{ root: { borderRadius: 0, color: "var(--tools-text-and-icon-color)" } }}
      >
        {tool.name}
      </Button>
    </Tooltip>
  );
};

export default ToolButton; 