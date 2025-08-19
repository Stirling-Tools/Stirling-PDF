import React from "react";
import { Button } from "@mantine/core";
import { Tooltip } from "../../shared/Tooltip";
import { ToolRegistryEntry } from "../../../data/toolsTaxonomy";
import FitText from "../../shared/FitText";

interface ToolButtonProps {
  id: string;
  tool: ToolRegistryEntry;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

const ToolButton: React.FC<ToolButtonProps> = ({ id, tool, isSelected, onSelect }) => {
  const handleClick = (id: string) => {
    if (tool.link) {
      // Open external link in new tab 
      window.open(tool.link, '_blank', 'noopener,noreferrer');
      return; 
    }
    // Normal tool selection
    onSelect(id);
  };

  return (
    <Tooltip content={tool.description} position="right" arrow={true} delay={500}>
      <Button
        variant={isSelected ? "filled" : "subtle"}
        onClick={()=> handleClick(id)}
        size="md"
        radius="md"
        leftSection={<div className="tool-button-icon" style={{ color: "var(--tools-text-and-icon-color)" }}>{tool.icon}</div>}
        fullWidth
        justify="flex-start"
        className="tool-button"
        styles={{ root: { borderRadius: 0, color: "var(--tools-text-and-icon-color)" } }}
      >
        <FitText
          text={tool.name}
          lines={1}
          minimumFontScale={0.8}
          as="span"
          style={{ display: 'inline-block', maxWidth: '100%' }}
        />
      </Button>
    </Tooltip>
  );
};

export default ToolButton; 