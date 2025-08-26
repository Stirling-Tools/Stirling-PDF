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
  rounded?: boolean;
}

const ToolButton: React.FC<ToolButtonProps> = ({ id, tool, isSelected, onSelect }) => {
  const isUnavailable = !tool.component && !tool.link;
  const handleClick = (id: string) => {
    if (isUnavailable) return;
    if (tool.link) {
      // Open external link in new tab
      window.open(tool.link, '_blank', 'noopener,noreferrer');
      return;
    }
    // Normal tool selection
    onSelect(id);
  };

  const tooltipContent = isUnavailable
    ? (<span><strong>Coming soon:</strong> {tool.description}</span>)
    : tool.description;

  return (
    <Tooltip content={tooltipContent} position="right" arrow={true} delay={500}>
      <Button
        variant={isSelected ? "filled" : "subtle"}
        onClick={()=> handleClick(id)}
        size="sm"
        radius="md"
        fullWidth
        justify="flex-start"
        className="tool-button"
        aria-disabled={isUnavailable}
        styles={{ root: { borderRadius: 0, color: "var(--tools-text-and-icon-color)", cursor: isUnavailable ? 'not-allowed' : undefined } }}
      >
        <div className="tool-button-icon" style={{ color: "var(--tools-text-and-icon-color)", marginRight: "0.5rem", transform: "scale(0.8)", transformOrigin: "center", opacity: isUnavailable ? 0.25 : 1 }}>{tool.icon}</div>
        <FitText
          text={tool.name}
          lines={1}
          minimumFontScale={0.8}
          as="span"
          style={{ display: 'inline-block', maxWidth: '100%', opacity: isUnavailable ? 0.25 : 1 }}
        />
      </Button>
    </Tooltip>
  );
};

export default ToolButton;
