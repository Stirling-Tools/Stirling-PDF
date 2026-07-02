import type { ReactNode } from "react";
import { ActionIcon } from "@mantine/core";
import CloseIcon from "@mui/icons-material/Close";
import "@app/components/shared/ToolPanelHeader.css";

export interface ToolPanelHeaderProps {
  /** Glyph rendered in the tinted circular badge at the header's leading edge. */
  icon: ReactNode;
  /** Header title. */
  title: ReactNode;
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
  onClose,
  closeLabel,
}: ToolPanelHeaderProps) {
  return (
    <div className="sui-panelhdr">
      <div className="sui-panelhdr__bar">
        <span className="sui-panelhdr__icon">{icon}</span>
        <span className="sui-panelhdr__label">{title}</span>
      </div>
      {onClose && (
        <ActionIcon
          className="sui-panelhdr__close"
          variant="subtle"
          color="gray"
          radius="xl"
          size="md"
          onClick={onClose}
          aria-label={closeLabel}
        >
          <CloseIcon sx={{ fontSize: 18 }} />
        </ActionIcon>
      )}
    </div>
  );
}
