import React from "react";
import { Button } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Tooltip } from "../../shared/Tooltip";
import { ToolIcon } from "../../shared/ToolIcon";
import { ToolRegistryEntry } from "../../../data/toolsTaxonomy";
import { useToolNavigation } from "../../../hooks/useToolNavigation";
import { handleUnlessSpecialClick } from "../../../utils/clickHandlers";
import FitText from "../../shared/FitText";
import { useHotkeys } from "../../../contexts/HotkeyContext";
import HotkeyDisplay from "../../hotkeys/HotkeyDisplay";
import FavoriteStar from "./FavoriteStar";
import { useToolWorkflow } from "../../../contexts/ToolWorkflowContext";
import { ToolId } from "../../../types/toolId";

interface ToolButtonProps {
  id: string;
  tool: ToolRegistryEntry;
  isSelected: boolean;
  onSelect: (id: string) => void;
  rounded?: boolean;
  disableNavigation?: boolean;
  matchedSynonym?: string;
  hasStars?: boolean;
}

const ToolButton: React.FC<ToolButtonProps> = ({ id, tool, isSelected, onSelect, disableNavigation = false, matchedSynonym, hasStars = false }) => {
  const { t } = useTranslation();
  // Special case: read and multiTool are navigational tools that are always available
  const isUnavailable = !tool.component && !tool.link && id !== 'read' && id !== 'multiTool';
  const { hotkeys } = useHotkeys();
  const binding = hotkeys[id];
  const { getToolNavigation } = useToolNavigation();
  const { isFavorite, toggleFavorite } = useToolWorkflow();
  const fav = isFavorite(id as ToolId);

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

  const tooltipContent = isUnavailable
    ? (<span><strong>Coming soon:</strong> {tool.description}</span>)
    : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <span>{tool.description}</span>
        {binding && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
            <span style={{ color: 'var(--mantine-color-dimmed)', fontWeight: 500 }}>{t('settings.hotkeys.shortcut', 'Shortcut')}</span>
            <HotkeyDisplay binding={binding} />
          </div>
        )}
      </div>
    );

  const buttonContent = (
    <>
      <ToolIcon
        icon={tool.icon}
        opacity={isUnavailable ? 0.25 : 1}
      />
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
        root: { 
          borderRadius: 0, 
          color: "var(--tools-text-and-icon-color)", 
          overflow: 'visible'
        },
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
        root: { 
          borderRadius: 0, 
          color: "var(--tools-text-and-icon-color)", 
          overflow: 'visible'
        },
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
      styles={{
        root: { 
          borderRadius: 0, 
          color: "var(--tools-text-and-icon-color)", 
          cursor: isUnavailable ? 'not-allowed' : undefined, 
          overflow: 'visible'
        }, 
        label: { overflow: 'visible' } 
      }}
    >
      {buttonContent}
    </Button>
  );

  const star = hasStars && !isUnavailable ? (
    <FavoriteStar
      isFavorite={fav}
      onToggle={() => toggleFavorite(id as ToolId)}
      className="tool-button-star"
      size="xs"
    />
  ) : null;

  return (
    <div className="tool-button-container">
      {star}
      <Tooltip content={tooltipContent} position="right" arrow={true} delay={500}>
        {buttonElement}
      </Tooltip>
    </div>
  );
};

export default ToolButton;
