import React from "react";
import { Button, Badge } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@app/components/shared/Tooltip";
import { ToolIcon } from "@app/components/shared/ToolIcon";
import { ToolRegistryEntry } from "@app/data/toolsTaxonomy";
import { useToolNavigation } from "@app/hooks/useToolNavigation";
import { handleUnlessSpecialClick } from "@app/utils/clickHandlers";
import FitText from "@app/components/shared/FitText";
import { useHotkeys } from "@app/contexts/HotkeyContext";
import HotkeyDisplay from "@app/components/hotkeys/HotkeyDisplay";
import FavoriteStar from "@app/components/tools/toolPicker/FavoriteStar";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { ToolId } from "@app/types/toolId";
import { useAppConfig } from "@app/contexts/AppConfigContext";

interface ToolButtonProps {
  id: ToolId;
  tool: ToolRegistryEntry;
  isSelected: boolean;
  onSelect: (id: ToolId) => void;
  rounded?: boolean;
  disableNavigation?: boolean;
  matchedSynonym?: string;
  hasStars?: boolean;
}

const ToolButton: React.FC<ToolButtonProps> = ({ id, tool, isSelected, onSelect, disableNavigation = false, matchedSynonym, hasStars = false }) => {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const premiumEnabled = config?.premiumEnabled;
  
  // Check if disabled due to premium requirement
  const requiresPremiumButNotEnabled = tool.requiresPremium === true && premiumEnabled !== true;
  // Check if tool is unavailable (no component, no link, except read/multiTool)
  const isUnavailable = !tool.component && !tool.link && id !== 'read' && id !== 'multiTool';
  const isDisabled = isUnavailable || requiresPremiumButNotEnabled;
  
  const { hotkeys } = useHotkeys();
  const binding = hotkeys[id];
  const { getToolNavigation } = useToolNavigation();
  const { isFavorite, toggleFavorite } = useToolWorkflow();
  const fav = isFavorite(id as ToolId);

  const handleClick = (id: ToolId) => {
    if (isDisabled) return;
    if (tool.link) {
      // Open external link in new tab
      window.open(tool.link, '_blank', 'noopener,noreferrer');
      return;
    }
    // Normal tool selection
    onSelect(id);
  };

  // Get navigation props for URL support (only if navigation is not disabled)
  const navProps = !isDisabled && !tool.link && !disableNavigation ? getToolNavigation(id, tool) : null;

  // Determine tooltip content based on disabled reason
  let tooltipContent: React.ReactNode;
  if (requiresPremiumButNotEnabled) {
    tooltipContent = (
      <span>
        <strong>{t('toolPanel.premiumFeature', 'Premium feature:')}</strong> {tool.description}
      </span>
    );
  } else if (isDisabled) {
    tooltipContent = (
      <span>
        <strong>{t('toolPanel.comingSoon', 'Coming soon:')}</strong> {tool.description}
      </span>
    );
  } else {
    tooltipContent = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <span>{tool.description}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
        {binding ? (
          <>
            <span style={{ color: 'var(--mantine-color-dimmed)', fontWeight: 500 }}>{t('settings.hotkeys.shortcut', 'Shortcut')}</span>
            <HotkeyDisplay binding={binding} />
          </>
        ) : (
          <span style={{ color: 'var(--mantine-color-dimmed)', fontWeight: 500, fontStyle: 'italic' }}>{t('settings.hotkeys.noShortcut', 'No shortcut set')}</span>
        )}
        </div>
      </div>
    );
  }

  const buttonContent = (
    <>
      <ToolIcon
        icon={tool.icon}
        opacity={isDisabled ? 0.25 : 1}
      />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1, overflow: 'visible' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%' }}>
          <FitText
            text={tool.name}
            lines={1}
            minimumFontScale={0.8}
            as="span"
            style={{ display: 'inline-block', maxWidth: '100%', opacity: isDisabled ? 0.25 : 1 }}
          />
          {tool.versionStatus === 'alpha' && (
            <Badge
              size="xs"
              variant="light"
              color="orange"
              style={{ flexShrink: 0, opacity: isDisabled ? 0.25 : 1 }}
            >
              {t('toolPanel.alpha', 'Alpha')}
            </Badge>
          )}
        </div>
        {matchedSynonym && (
          <span style={{
            fontSize: '0.75rem',
            color: 'var(--mantine-color-dimmed)',
            opacity: isDisabled ? 0.25 : 1,
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
      data-tour={`tool-button-${id}`}
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
  ) : tool.link && !isDisabled ? (
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
      data-tour={`tool-button-${id}`}
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
    // For unavailable/premium tools, use regular button
    <Button
      variant={isSelected ? "filled" : "subtle"}
      onClick={() => handleClick(id)}
      size="sm"
      radius="md"
      fullWidth
      justify="flex-start"
      className="tool-button"
      aria-disabled={isDisabled}
      data-tour={`tool-button-${id}`}
      styles={{
        root: {
          borderRadius: 0,
          color: "var(--tools-text-and-icon-color)",
          cursor: isDisabled ? 'not-allowed' : undefined,
          overflow: 'visible'
        },
        label: { overflow: 'visible' }
      }}
    >
      {buttonContent}
    </Button>
  );

  const star = hasStars && !isDisabled ? (
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
