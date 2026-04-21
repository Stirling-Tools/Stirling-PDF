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
  matchedSynonym?: string;
  hasStars?: boolean;
  /** Called when an unavailable tool is clicked; if provided, overrides the default no-op */
  onUnavailableClick?: () => void;
}

const ToolButton: React.FC<ToolButtonProps> = ({
  id,
  tool,
  isSelected,
  onSelect,
  disableNavigation = false,
  matchedSynonym,
  hasStars = false,
  onUnavailableClick,
}) => {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const premiumEnabled = config?.premiumEnabled;
  const { isFavorite, toggleFavorite, toolAvailability } = useToolWorkflow();
  const disabledReason = getToolDisabledReason(
    id,
    tool,
    toolAvailability,
    premiumEnabled,
  );
  const isUnavailable = disabledReason !== null;
  // If onUnavailableClick is provided for a non-comingSoon tool, render as "cloud-available":
  // full opacity, cloud badge, normal tooltip — clicking still fires onUnavailableClick (e.g. sign-in).
  const showAsCloudAvailable =
    isUnavailable &&
    !!onUnavailableClick &&
    disabledReason !== "comingSoon" &&
    disabledReason !== "selfHostedOffline";
  const visuallyUnavailable = isUnavailable && !showAsCloudAvailable;
  const { hotkeys } = useHotkeys();
  const binding = hotkeys[id];
  const { getToolNavigation } = useToolNavigation();
  const fav = isFavorite(id as ToolId);

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
      window.open(tool.link, "_blank", "noopener,noreferrer");
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

  const { key: disabledKey, fallback: disabledFallback } =
    getDisabledLabel(disabledReason);
  const disabledMessage = t(disabledKey, disabledFallback);

  const tooltipContent = visuallyUnavailable ? (
    <span>
      <strong>{disabledMessage}</strong> {tool.description}
    </span>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
      <span>{tool.description}</span>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          fontSize: "0.75rem",
        }}
      >
        {binding ? (
          <>
            <span
              style={{ color: "var(--mantine-color-dimmed)", fontWeight: 500 }}
            >
              {t("settings.hotkeys.shortcut", "Shortcut")}
            </span>
            <HotkeyDisplay binding={binding} />
          </>
        ) : (
          <span
            style={{
              color: "var(--mantine-color-dimmed)",
              fontWeight: 500,
              fontStyle: "italic",
            }}
          >
            {t("settings.hotkeys.noShortcut", "No shortcut set")}
          </span>
        )}
      </div>
    </div>
  );

  const buttonContent = (
    <>
      <ToolIcon icon={tool.icon} opacity={visuallyUnavailable ? 0.25 : 1} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          flex: 1,
          overflow: "visible",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            width: "100%",
          }}
        >
          <FitText
            text={tool.name}
            lines={1}
            minimumFontScale={0.8}
            as="span"
            style={{
              display: "inline-block",
              maxWidth: "100%",
              opacity: visuallyUnavailable ? 0.25 : 1,
            }}
          />
          {tool.versionStatus === "alpha" && (
            <Badge
              size="xs"
              variant="light"
              color="orange"
              style={{ flexShrink: 0, opacity: visuallyUnavailable ? 0.25 : 1 }}
            >
              {t("toolPanel.alpha", "Alpha")}
            </Badge>
          )}
          {usesCloud && !visuallyUnavailable && <CloudBadge />}
        </div>
        {matchedSynonym && (
          <span
            style={{
              fontSize: "0.75rem",
              color: "var(--mantine-color-dimmed)",
              opacity: visuallyUnavailable ? 0.25 : 1,
              marginTop: "1px",
              overflow: "visible",
              whiteSpace: "nowrap",
            }}
          >
            {matchedSynonym}
          </span>
        )}
      </div>
    </>
  );

  const handleExternalClick = (e: React.MouseEvent) => {
    handleUnlessSpecialClick(e, () => handleClick(id));
  };

  const selectedStyles = isSelected ? { backgroundColor: "#EAEAEA", color: "var(--tools-text-and-icon-color)" } : {};

  const buttonElement = navProps ? (
    // For internal tools with URLs, render Button as an anchor for proper link behavior
    <Button
      component="a"
      href={navProps.href}
      onClick={navProps.onClick}
      variant="subtle"
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
          overflow: "visible",
          ...selectedStyles,
        },
        label: { overflow: "visible" },
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
      variant="subtle"
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
          overflow: "visible",
          ...selectedStyles,
        },
        label: { overflow: "visible" },
      }}
    >
      {buttonContent}
    </Button>
  ) : (
    // For unavailable tools, use regular button
    <Button
      variant="subtle"
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
          cursor: visuallyUnavailable ? "not-allowed" : undefined,
          overflow: "visible",
          ...selectedStyles,
        },
        label: { overflow: "visible" },
      }}
    >
      {buttonContent}
    </Button>
  );

  const star =
    hasStars && !visuallyUnavailable ? (
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
      <Tooltip content={tooltipContent} position="left" arrow={true} delay={500}>
        {buttonElement}
      </Tooltip>
    </div>
  );
};

export default ToolButton;
