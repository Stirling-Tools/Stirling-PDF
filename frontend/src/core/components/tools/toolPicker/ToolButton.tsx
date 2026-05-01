import React from "react";
import { Button, Badge } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@app/components/shared/Tooltip";
import { ToolIcon } from "@app/components/shared/ToolIcon";
import { ToolRegistryEntry } from "@app/data/toolsTaxonomy";
import { useToolNavigation } from "@app/hooks/useToolNavigation";
import { handleUnlessSpecialClick } from "@app/utils/clickHandlers";
import { openUrl } from "@app/utils/urlExtensions";
import FitText from "@app/components/shared/FitText";
import { useHotkeys } from "@app/contexts/HotkeyContext";
import HotkeyDisplay from "@app/components/hotkeys/HotkeyDisplay";
import FavoriteStar from "@app/components/tools/toolPicker/FavoriteStar";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import type { ToolId } from "@app/types/toolId";
import {
  getToolDisabledReason,
  getDisabledLabel,
} from "@app/components/tools/fullscreen/shared";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { CloudBadge } from "@app/components/shared/CloudBadge";
import { useWillUseCloud } from "@app/hooks/useWillUseCloud";

interface ToolButtonProps {
  id: ToolId;
  tool: ToolRegistryEntry;
  isSelected: boolean;
  onSelect: (id: ToolId) => void;
  rounded?: boolean;
  disableNavigation?: boolean;
  onUnavailableClick?: () => void;
  matchedSynonym?: string;
  hasStars?: boolean;
}

const ToolButton: React.FC<ToolButtonProps> = ({
  id,
  tool,
  isSelected,
  onSelect,
  rounded = false,
  disableNavigation = false,
  onUnavailableClick,
  matchedSynonym,
  hasStars = false,
}) => {
  const { t } = useTranslation();
  const { getToolNavigation } = useToolNavigation();
  const { toolAvailability } = useToolWorkflow();
  const { config } = useAppConfig();
  const premiumEnabled = config?.premiumEnabled;

  // Check if this tool will route to SaaS backend (desktop only)
  const rawEndpoint = tool.operationConfig?.endpoint;
  const endpointString =
    typeof rawEndpoint === "string" ? rawEndpoint : undefined;
  const usesCloud = useWillUseCloud(endpointString);

  const handleClick = (id: ToolId) => {
    if (isUnavailable) {
      onUnavailableClick?.();
      return;
    }
    if (tool.link) {
      // Open external link in new tab
      openUrl(tool.link, "_blank", "noopener,noreferrer");
      return;
    }
    // Normal tool selection
    onSelect(id);
  };

  // Get navigation props for URL support (only if navigation is not disabled)
  const navProps =
    !isUnavailable && !tool.link && !disableNavigation
      ? getToolNavigation(id, tool)
      : null;

  const isUnavailable = toolAvailability?.[id] === "unavailable";

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
      className={`tool-button ${rounded ? "tool-button--rounded" : ""} ${
        isSelected ? "tool-button--selected" : ""
      } ${isUnavailable ? "tool-button--unavailable" : ""}`}
      title={tool.name}
      data-tool-id={id}
      disabled={isUnavailable}
      aria-label={tool.name}
    >
      <div className="tool-button-content">
        <ToolIcon icon={tool.icon} size={20} />
        <FitText
          text={matchedSynonym || tool.name}
          className="tool-button-label"
          maxLines={1}
        />
        {hasStars && <FavoriteStar isFavorite={false} onToggle={() => {}} />}
        {usesCloud && <CloudBadge />}
        {isUnavailable && (
          <Badge
            size="xs"
            variant="light"
            color="gray"
            className="tool-button-unavailable-badge"
          >
            {t("common.unavailable", "Unavailable")}
          </Badge>
        )}
      </div>
    </Button>
  ) : tool.link && !isUnavailable ? (
    // For external links, render Button as an anchor with proper href
    <Button
      component="a"
      href={tool.link}
      onClick={handleExternalClick}
      variant={isSelected ? "filled" : "subtle"}
      size="sm"
      radius="md"
      className={`tool-button ${rounded ? "tool-button--rounded" : ""} ${
        isSelected ? "tool-button--selected" : ""
      }`}
      title={tool.name}
      data-tool-id={id}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={tool.name}
    >
      <div className="tool-button-content">
        <ToolIcon icon={tool.icon} size={20} />
        <FitText
          text={matchedSynonym || tool.name}
          className="tool-button-label"
          maxLines={1}
        />
        {hasStars && <FavoriteStar isFavorite={false} onToggle={() => {}} />}
      </div>
    </Button>
  ) : (
    // For normal tools without URLs
    <Button
      variant={isSelected ? "filled" : "subtle"}
      onClick={() => handleClick(id)}
      size="sm"
      radius="md"
      className={`tool-button ${rounded ? "tool-button--rounded" : ""} ${
        isSelected ? "tool-button--selected" : ""
      } ${isUnavailable ? "tool-button--unavailable" : ""}`}
      title={tool.name}
      data-tool-id={id}
      disabled={isUnavailable}
      aria-label={tool.name}
    >
      <div className="tool-button-content">
        <ToolIcon icon={tool.icon} size={20} />
        <FitText
          text={matchedSynonym || tool.name}
          className="tool-button-label"
          maxLines={1}
        />
        {hasStars && <FavoriteStar isFavorite={false} onToggle={() => {}} />}
        {usesCloud && <CloudBadge />}
        {isUnavailable && (
          <Badge
            size="xs"
            variant="light"
            color="gray"
            className="tool-button-unavailable-badge"
          >
            {t("common.unavailable", "Unavailable")}
          </Badge>
        )}
      </div>
    </Button>
  );

  const unavailableReason = isUnavailable
    ? getToolDisabledReason(tool, premiumEnabled)
    : null;
  const disabledLabel = unavailableReason
    ? getDisabledLabel(unavailableReason)
    : null;

  return (
    <Tooltip
      label={disabledLabel || tool.description}
      disabled={!disabledLabel && !tool.description}
      position="right"
      withArrow
      openDelay={500}
    >
      {buttonElement}
    </Tooltip>
  );
};

export default ToolButton;