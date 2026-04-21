import React, { useCallback } from "react";
import { ActionIcon } from "@mantine/core";
import { useRightRail } from "@app/contexts/RightRailContext";
import { useNavigationState } from "@app/contexts/NavigationContext";
import { Tooltip } from "@app/components/shared/Tooltip";
import type { RightRailButtonConfig, RightRailRenderContext } from "@app/types/rightRail";

/**
 * Mini toolbar rendered at the top of the ToolPanel when in viewer mode.
 * Shows "tool-panel" section buttons — viewer mode tools like annotate, redact, form fill.
 */
export function ToolPanelViewerBar() {
  const { workbench } = useNavigationState();
  const { buttons, actions, allButtonsDisabled } = useRightRail();

  const toolPanelButtons = buttons
    .filter((btn) => btn.section === "tool-panel" && (btn.visible ?? true))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const renderButton = useCallback(
    (btn: RightRailButtonConfig) => {
      const action = actions[btn.id];
      const disabled = Boolean(btn.disabled || allButtonsDisabled);
      const isActive = Boolean(btn.active);

      const triggerAction = () => {
        if (!disabled) action?.();
      };

      if (btn.render) {
        const context: RightRailRenderContext = {
          id: btn.id,
          disabled,
          allButtonsDisabled,
          action,
          triggerAction,
          active: isActive,
        };
        return btn.render(context) ?? null;
      }

      if (!btn.icon) return null;

      const ariaLabel = btn.ariaLabel || (typeof btn.tooltip === "string" ? btn.tooltip : undefined);
      const buttonNode = (
        <ActionIcon
          variant={isActive ? "filled" : "subtle"}
          color={isActive ? "blue" : undefined}
          radius="md"
          className="workbench-bar-action-icon"
          onClick={triggerAction}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-pressed={isActive || undefined}
        >
          {btn.icon}
        </ActionIcon>
      );

      if (!btn.tooltip) return buttonNode;
      return (
        <Tooltip content={btn.tooltip} position="bottom" offset={6} arrow portalTarget={document.body}>
          <div style={{ display: "inline-flex" }}>{buttonNode}</div>
        </Tooltip>
      );
    },
    [actions, allButtonsDisabled],
  );

  if (workbench !== "viewer" || toolPanelButtons.length === 0) return null;

  return (
    <div className="tool-panel-viewer-bar">
      {toolPanelButtons.map((btn) => {
        const content = renderButton(btn);
        if (!content) return null;
        return (
          <div key={btn.id} style={{ display: "inline-flex", alignItems: "center" }}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
