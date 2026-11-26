import { useId, type ReactNode } from "react";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { Icon } from "@editor/ui/Icon";
import { Tooltip } from "@editor/components/shared/Tooltip";
import "@editor/components/shared/ToolPanelHeader.css";

export interface ToolPanelHeaderProps {
  /** Glyph rendered in the tinted circular badge at the header's leading edge. */
  icon: ReactNode;
  /** Header title. */
  title: ReactNode;
  /**
   * Shown when the title bar is hovered or focused, and read as its
   * description; the same text the tool list shows. With one, the bar takes
   * focus, since it has nothing else a keyboard can reach.
   */
  description?: ReactNode;
  /** Close (X) handler. The trailing close button renders only when supplied. */
  onClose?: () => void;
  /** aria-label for the close button. */
  closeLabel?: string;
}

/**
 * Header for the active-tool rail surface: a tinted icon badge + title in a
 * rounded bar with a trailing close button.
 *
 * Core-owned so the OSS build carries no design-system dependency. It mirrors
 * the shared rail header's styling for the simple (non-menu) case the tool panel
 * needs; the richer variant (dropdown menu, accents, loading dot) lives in the
 * design system for the AI chat and Policies surfaces.
 */
export function ToolPanelHeader({
  icon,
  title,
  description,
  onClose,
  closeLabel,
}: ToolPanelHeaderProps) {
  const titleId = useId();
  const descriptionId = useId();
  const bar = (
    <div
      className="sui-panelhdr__bar"
      {...(description && {
        role: "group",
        tabIndex: 0,
        "aria-labelledby": titleId,
        "aria-describedby": descriptionId,
      })}
    >
      <span className="sui-panelhdr__icon">{icon}</span>
      <span id={titleId} className="sui-panelhdr__label">
        {title}
      </span>
    </div>
  );

  return (
    <div className="sui-panelhdr">
      {description ? (
        <>
          <Tooltip content={description} position="left" arrow delay={500}>
            {bar}
          </Tooltip>
          <span id={descriptionId} hidden>
            {description}
          </span>
        </>
      ) : (
        bar
      )}
      {onClose && (
        <ActionIcon
          className="sui-panelhdr__close"
          variant="tertiary"
          accent="neutral"
          shape="circle"
          size="md"
          onClick={onClose}
          aria-label={closeLabel ?? ""}
        >
          <Icon name="x" size={18} />
        </ActionIcon>
      )}
    </div>
  );
}
