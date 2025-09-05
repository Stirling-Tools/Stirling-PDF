import React from "react";
import { Button } from "@mantine/core";
import { Tooltip } from "../../shared/Tooltip";
import { ToolRegistryEntry } from "../../../data/toolsTaxonomy";
import { useToolNavigation } from "../../../hooks/useToolNavigation";
import { handleUnlessSpecialClick } from "../../../utils/clickHandlers";
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
  const { getToolNavigation } = useToolNavigation();

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

  // Get navigation props for URL support
  const navProps = !isUnavailable && !tool.link ? getToolNavigation(id, tool) : null;

  const tooltipContent = isUnavailable
    ? (<span><strong>Coming soon:</strong> {tool.description}</span>)
    : tool.description;

  const buttonContent = (
    <>
      <div className="tool-button-icon" style={{ color: "var(--tools-text-and-icon-color)", marginRight: "0.5rem", transform: "scale(0.8)", transformOrigin: "center", opacity: isUnavailable ? 0.25 : 1 }}>{tool.icon}</div>
      <FitText
        text={tool.name}
        lines={1}
        minimumFontScale={0.8}
        as="span"
        style={{ display: 'inline-block', maxWidth: '100%', opacity: isUnavailable ? 0.25 : 1 }}
      />
    </>
  );

  const handleExternalClick = (e: React.MouseEvent) => {
    handleUnlessSpecialClick(e, () => handleClick(id));
  };

  const buttonElement = navProps ? (
    // For internal tools with URLs, render Button as an anchor for proper link behavior
    <Button
      component="a"
      href={navProps.href}
      onClick={navProps.onClick}
      variant={isSelected ? "filled" : "subtle"}
      size="sm"
      radius="md"
      fullWidth
      justify="flex-start"
      className="tool-button"
      styles={{ root: { borderRadius: 0, color: "var(--tools-text-and-icon-color)" } }}
    >
      {buttonContent}
    </Button>
  ) : tool.link && !isUnavailable ? (
    // For external links, render Button as an anchor with proper href
    <Button
      component="a"
      href={tool.link}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleExternalClick}
      variant={isSelected ? "filled" : "subtle"}
      size="sm"
      radius="md"
      fullWidth
      justify="flex-start"
      className="tool-button"
      styles={{ root: { borderRadius: 0, color: "var(--tools-text-and-icon-color)" } }}
    >
      {buttonContent}
    </Button>
  ) : (
    // For unavailable tools, use regular button
    <Button
      variant={isSelected ? "filled" : "subtle"}
      onClick={() => handleClick(id)}
      size="sm"
      radius="md"
      fullWidth
      justify="flex-start"
      className="tool-button"
      aria-disabled={isUnavailable}
      styles={{ root: { borderRadius: 0, color: "var(--tools-text-and-icon-color)", cursor: isUnavailable ? 'not-allowed' : undefined } }}
    >
      {buttonContent}
    </Button>
  );

  return (
    <Tooltip content={tooltipContent} position="right" arrow={true} delay={500}>
      {buttonElement}
    </Tooltip>
  );
};

export default ToolButton;
