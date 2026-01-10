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
import { getToolDisabledReason, getDisabledLabel } from "@app/components/tools/fullscreen/shared";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { openExternalUrl } from "@app/utils/openExternalUrl";

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
  const { isFavorite, toggleFavorite, toolAvailability } = useToolWorkflow();
  const disabledReason = getToolDisabledReason(id, tool, toolAvailability, premiumEnabled);
  const isUnavailable = disabledReason !== null;
  const { hotkeys } = useHotkeys();
  const binding = hotkeys[id];
  const { getToolNavigation } = useToolNavigation();
  const fav = isFavorite(id as ToolId);

  const handleClick = (id: ToolId) => {
    if (isUnavailable) return;
    if (tool.link) {
      // Open external link in new tab
      void openExternalUrl(tool.link);
      return;
    }
    // Normal tool selection
    onSelect(id);
  };

  // Get navigation props for URL support (only if navigation is not disabled)
  const navProps = !isUnavailable && !tool.link && !disableNavigation ? getToolNavigation(id, tool) : null;

  const { key: disabledKey, fallback: disabledFallback } = getDisabledLabel(disabledReason);
  const disabledMessage = t(disabledKey, disabledFallback);

  const tooltipContent = isUnavailable
    ? (<span><strong>{disabledMessage}</strong> {tool.description}</span>)
    : (
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

  const buttonContent = (
    <>
      <ToolIcon
        icon={tool.icon}
        opacity={isUnavailable ? 0.25 : 1}
      />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1, overflow: 'visible' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%' }}>
          <FitText
            text={tool.name}
            lines={1}
            minimumFontScale={0.8}
            as="span"
            style={{ display: 'inline-block', maxWidth: '100%', opacity: isUnavailable ? 0.25 : 1 }}
          />
          {tool.versionStatus === 'alpha' && (
            <Badge
              size="xs"
              variant="light"
              color="orange"
              style={{ flexShrink: 0, opacity: isUnavailable ? 0.25 : 1 }}
            >
              {t('toolPanel.alpha', 'Alpha')}
            </Badge>
          )}
        </div>
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
      data-tour={`tool-button-${id}`}
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
