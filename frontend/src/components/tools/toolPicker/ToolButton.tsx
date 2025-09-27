import React from "react";
import { Button } from "@mantine/core";
import { Tooltip } from "../../shared/Tooltip";
import { ToolRegistryEntry } from "../../../data/toolsTaxonomy";
import { useToolNavigation } from "../../../hooks/useToolNavigation";
import { handleUnlessSpecialClick } from "../../../utils/clickHandlers";
import FitText from "../../shared/FitText";
import { useHotkeysContext } from "../../../contexts/HotkeysContext";

interface ToolButtonProps {
  id: string;
  tool: ToolRegistryEntry;
  isSelected: boolean;
  onSelect: (id: string) => void;
  rounded?: boolean;
  disableNavigation?: boolean;
  matchedSynonym?: string;
}

const ToolButton: React.FC<ToolButtonProps> = ({ id, tool, isSelected, onSelect, disableNavigation = false, matchedSynonym }) => {
  // Special case: read and multiTool are navigational tools that are always available
  const isUnavailable = !tool.component && !tool.link && id !== 'read' && id !== 'multiTool';
  const { getToolNavigation } = useToolNavigation();
  const { getHotkey, formatHotkeyParts } = useHotkeysContext();

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

  // Get navigation props for URL support (only if navigation is not disabled)
  const navProps = !isUnavailable && !tool.link && !disableNavigation ? getToolNavigation(id, tool) : null;

  const assignedHotkey = getHotkey(id);
  const hotkeyParts = formatHotkeyParts(assignedHotkey);

  const descriptionNode = isUnavailable
    ? (<span><strong>Coming soon:</strong> {tool.description}</span>)
    : tool.description;

  const tooltipContent = hotkeyParts.length > 0
    ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <span>{descriptionNode}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--mantine-color-dimmed)' }}>Shortcut:</span>
          {hotkeyParts.map((part, index) => (
            <span
              key={`${id}-hotkey-${part}-${index}`}
              style={{
                backgroundColor: 'var(--mantine-color-gray-2, rgba(0,0,0,0.08))',
                color: 'var(--mantine-color-dark-6, #1A1B1E)',
                borderRadius: '0.4rem',
                padding: '0.1rem 0.45rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                letterSpacing: '0.01em'
              }}
            >
              {part}
            </span>
          ))}
        </div>
      </div>
    )
    : descriptionNode;

  const buttonContent = (
    <>
      <div className="tool-button-icon" style={{ color: "var(--tools-text-and-icon-color)", marginRight: "0.5rem", transform: "scale(0.8)", transformOrigin: "center", opacity: isUnavailable ? 0.25 : 1 }}>{tool.icon}</div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1, overflow: 'visible' }}>
        <FitText
          text={tool.name}
          lines={1}
          minimumFontScale={0.8}
          as="span"
          style={{ display: 'inline-block', maxWidth: '100%', opacity: isUnavailable ? 0.25 : 1 }}
        />
        {matchedSynonym && (
          <span style={{ 
            fontSize: '0.75rem', 
            color: 'var(--mantine-color-dimmed)', 
            opacity: isUnavailable ? 0.25 : 1,
            marginTop: '1px',
            overflow: 'visible',
            whiteSpace: 'nowrap'
          }}>
            {matchedSynonym}
          </span>
        )}
      </div>
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
      styles={{ 
        root: { borderRadius: 0, color: "var(--tools-text-and-icon-color)", overflow: 'visible' },
        label: { overflow: 'visible' }
      }}
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
      styles={{ 
        root: { borderRadius: 0, color: "var(--tools-text-and-icon-color)", overflow: 'visible' },
        label: { overflow: 'visible' }
      }}
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
      styles={{ root: { borderRadius: 0, color: "var(--tools-text-and-icon-color)", cursor: isUnavailable ? 'not-allowed' : undefined, overflow: 'visible' }, label: { overflow: 'visible' } }}
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
